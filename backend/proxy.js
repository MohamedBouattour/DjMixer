const fs = require('fs');
const dotenv = require('dotenv');

// Check for secrets in VPS mount path
const secretPath = '/etc/secrets/.env';
if (fs.existsSync(secretPath)) {
    console.log('[CONFIG] Loading secrets from /etc/secrets/.env');
    dotenv.config({ path: secretPath });
} else {
    dotenv.config();
}
const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const path = require('path');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const { OAuth2Client } = require('google-auth-library');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || '323412866282-j1jfdrt869l73r73agldin32ud2ictn0.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'djmixer-secret-change-in-prod';

const app = express();
const PORT = process.env.PORT || 3002;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const RAPID_API_KEY = process.env.RAPID_API_KEY;
const RAPID_API_HOST = process.env.RAPID_API_HOST;

app.use(cors());
app.use(express.json());

// Determine dist path - prioritize 'public' as per prepare-deploy.js
const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, '../dist');
const cacheDir = path.join(__dirname, 'cache');
const dataDir = path.join(__dirname, 'data');
let staticDir = null;

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ─── SQLite Database Setup ────────────────────────────────────────────────────
const db = new Database(path.join(dataDir, 'djmixer.db'));
db.pragma('journal_mode = WAL'); // better concurrency

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        email       TEXT UNIQUE NOT NULL,
        username    TEXT NOT NULL,
        password    TEXT,
        picture     TEXT,
        provider    TEXT NOT NULL DEFAULT 'email',
        created_at  INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS user_tracks (
        user_id     TEXT NOT NULL,
        track_id    TEXT NOT NULL,
        track_data  TEXT NOT NULL,
        updated_at  INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (user_id, track_id)
    );
`);

// Migrate old JSON flat-files into SQLite (one-time, non-destructive)
try {
    if (fs.existsSync(dataDir)) {
        fs.readdirSync(dataDir)
          .filter(f => f.endsWith('_tracks.json'))
          .forEach(f => {
              const uid = f.replace('_tracks.json', '');
              const tracks = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
              if (Array.isArray(tracks)) {
                  const insert = db.prepare(`INSERT OR IGNORE INTO user_tracks (user_id,track_id,track_data) VALUES (?,?,?)`);
                  const run = db.transaction((rows) => rows.forEach(t => insert.run(uid, t.id, JSON.stringify(t))));
                  run(tracks.filter(t => t.id));
                  console.log(`[MIGRATE] Imported ${tracks.length} tracks for ${uid}`);
              }
          });
    }
} catch(e) { console.warn('[MIGRATE] Migration error:', e.message); }

// ─── DB Helper Fns ────────────────────────────────────────────────────────────
const generateId = () => require('crypto').randomUUID();

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUser = db.prepare(`INSERT INTO users (id,email,username,password,picture,provider) VALUES (?,?,?,?,?,?)`);
const upsertGoogleUser = db.prepare(`
    INSERT INTO users (id,email,username,picture,provider) VALUES (?,?,?,?,'google')
    ON CONFLICT(email) DO UPDATE SET username=excluded.username, picture=excluded.picture
    RETURNING *
`);
const getUserTracksStmt = db.prepare('SELECT track_data FROM user_tracks WHERE user_id = ? ORDER BY updated_at DESC');
const upsertTrack = db.prepare(`INSERT INTO user_tracks (user_id,track_id,track_data,updated_at) VALUES (?,?,?,unixepoch()) ON CONFLICT(user_id,track_id) DO UPDATE SET track_data=excluded.track_data, updated_at=excluded.updated_at`);
const saveAllTracks = db.transaction((uid, tracks) => {
    tracks.forEach(t => upsertTrack.run(uid, t.id, JSON.stringify(t)));
});

if (fs.existsSync(publicPath)) {
    console.log(`[SERVER] Serving static files from ${publicPath}`);
    console.log(`[SERVER] Index exists? ${fs.existsSync(path.join(publicPath, 'index.html'))}`);
    app.use(express.static(publicPath));
    staticDir = publicPath;
} else if (fs.existsSync(distPath)) {
    console.log(`[SERVER] Serving static files from ${distPath}`);
    app.use(express.static(distPath));
    staticDir = distPath;
} else {
    console.warn(`[SERVER] WARNING: No static files found (checked public and dist)`);
}

// Helper for decoding HTML entities if needed (basic ones)
function decodeHTMLEntities(text) {
    if (!text) return "";
    return text.replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

// Helper: Fetch from RapidAPI with retry for 'processing' status
async function fetchRapidAPI(videoId) {
    const url = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': RAPID_API_KEY,
            'x-rapidapi-host': RAPID_API_HOST
        }
    };

    let attempts = 0;
    const maxAttempts = 10; // Wait up to 10-15 seconds

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`RapidAPI HTTP ${response.status}`);
            const data = await response.json();

            if (data.status === 'ok' && data.link) {
                return data.link;
            } else if (data.status === 'processing') {
                console.log(`[RapidAPI] Processing ${videoId}... (attempt ${attempts + 1})`);
                await new Promise(resolve => setTimeout(resolve, 1500));
                attempts++;
            } else {
                throw new Error(data.msg || 'RapidAPI conversion failed');
            }
        } catch (error) {
            console.error(`[RapidAPI] Error: ${error.message}`);
            throw error; // Propagate error to trigger fallback or failure
        }
    }
    throw new Error('RapidAPI timeout');
}

// ─── Auth: Email Register ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        if (!email || !username || !password) return res.status(400).json({ error: 'All fields required' });
        if (getUserByEmail.get(email)) return res.status(409).json({ error: 'Email already registered' });

        const hashed = await bcrypt.hash(password, 10);
        const id = generateId();
        insertUser.run(id, email, username, hashed, null, 'email');

        const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '90d' });
        console.log(`[AUTH] Registered: ${email}`);
        res.json({ id, email, username, picture: null, token });
    } catch (error) {
        console.error('[AUTH] Register Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ─── Auth: Email Login ─────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const row = getUserByEmail.get(email);
        if (!row) return res.status(401).json({ error: 'Invalid email or password' });
        if (!row.password) return res.status(401).json({ error: 'Please sign in with Google' });

        const valid = await bcrypt.compare(password, row.password);
        if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, { expiresIn: '90d' });
        console.log(`[AUTH] Login: ${email}`);
        res.json({ id: row.id, email: row.email, username: row.username, picture: row.picture, token });
    } catch (error) {
        console.error('[AUTH] Login Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ─── Auth: Google Login ────────────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential, sub, email: emailField, name, picture } = req.body;

        let payload = { sub, email: emailField, name, picture };

        // Only parse credential JWT if we didn't get direct userinfo fields
        if (credential && !sub) {
            try {
                const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
                const p = ticket.getPayload();
                payload = { sub: p.sub, email: p.email, name: p.name, picture: p.picture };
            } catch (verifyError) {
                console.warn('[AUTH] Token verify fallback:', verifyError.message);
                const base64Url = credential.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const p = JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
                    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                ).join('')));
                payload = { sub: p.sub, email: p.email, name: p.name, picture: p.picture };
            }
        }

        if (!payload.sub || !payload.email) return res.status(400).json({ error: 'Missing user info from Google' });

        // Upsert into DB — same Google user across devices stays consistent
        const row = upsertGoogleUser.get(payload.sub, payload.email,
            payload.name || payload.email.split('@')[0], payload.picture || null);

        const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, { expiresIn: '90d' });
        console.log(`[AUTH] Google login: ${row.email}`);
        res.json({ id: row.id, email: row.email, username: row.username, picture: row.picture, token });
    } catch (error) {
        console.error('[AUTH] Google Auth Error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// ─── User Tracks: GET (merged unique tracks from DB) ──────────────────────
app.get('/api/users/:uid/tracks', (req, res) => {
    try {
        const rows = getUserTracksStmt.all(req.params.uid);
        const tracks = rows.map(r => { try { return JSON.parse(r.track_data); } catch { return null; } }).filter(Boolean);
        res.json(tracks);
    } catch (error) {
        console.error('[USER_TRACKS] Error reading tracks:', error);
        res.status(500).json({ error: 'Failed to read user tracks' });
    }
});

// ─── User Tracks: POST (upsert unique by track id) ─────────────────────────
app.post('/api/users/:uid/tracks', (req, res) => {
    try {
        const uid = req.params.uid;
        const { tracks } = req.body;
        if (!tracks || !Array.isArray(tracks)) return res.status(400).json({ error: 'Invalid tracks data' });
        saveAllTracks(uid, tracks.filter(t => t.id));
        console.log(`[USER_TRACKS] Saved ${tracks.length} tracks for user ${uid}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[USER_TRACKS] Error saving tracks:', error);
        res.status(500).json({ error: 'Failed to save user tracks' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        const source = req.query.source; // 'spotify' or 'youtube' (default)

        if (!query) return res.status(400).json({ error: 'Query required' });

        console.log(`[SEARCH] Query: "${query}" | Source: ${source || 'youtube'}`);

        // STRATEGY 1: Skysound Scraping (Spotify Source or specific request)
        // Best for Spotify flow as it returns skysound IDs that are reliable on restricted networks
        if (source === 'spotify') {
            try {
                const searchApiUrl = `https://skysound7.com/api/search?query=${encodeURIComponent(query)}`;
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                };

                const pageResponse = await fetch(searchApiUrl, { headers, redirect: 'follow' });
                if (!pageResponse.ok) throw new Error(`Skysound search failed: ${pageResponse.status}`);

                const html = await pageResponse.text();
                const results = [];
                const regex = /<li class="__adv_list_track[\s\S]*?<\/li>/g;
                let match;

                while ((match = regex.exec(html)) !== null) {
                    const itemHtml = match[0];
                    const urlMatch = itemHtml.match(/data-url="([^"]+)"/);
                    if (!urlMatch) continue;

                    const streamUrl = urlMatch[1];
                    let title = "Unknown Title";
                    const titleMatch = itemHtml.match(/class="[^"]*__adv_name">.*?<em>([^<]+)<\/em>/) ||
                        itemHtml.match(/class="[^"]*__adv_name">([^<]+)</);
                    if (titleMatch) title = decodeHTMLEntities(titleMatch[1]);

                    let artist = "Unknown Artist";
                    const artistMatch = itemHtml.match(/class="[^"]*__adv_artist">([^<]+)<\/a>/);
                    if (artistMatch) artist = decodeHTMLEntities(artistMatch[1]);

                    let duration = 0;
                    const durationMatch = itemHtml.match(/class="[^"]*__adv_duration">(\d+):(\d+)</);
                    let timestamp = "0:00";
                    if (durationMatch) {
                        duration = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
                        timestamp = `${durationMatch[1]}:${durationMatch[2]}`;
                    }

                    const id = Buffer.from(streamUrl).toString('base64');

                    results.push({
                        id: id,
                        title: title,
                        artist: artist,
                        author: artist,
                        duration: duration,
                        timestamp: timestamp,
                        thumbnail: 'https://skysound7.com/i/img/he-logo.png',
                        streamUrl: streamUrl,
                        source: 'skysound'
                    });
                }

                if (results.length > 0) {
                    console.log(`[SEARCH] Found ${results.length} Skysound tracks`);
                    return res.json(results);
                } else {
                    console.warn('[SEARCH] Skysound returned 0 results, falling back to YouTube');
                }
            } catch (err) {
                console.warn(`[SEARCH] Spotify/Skysound strategy failed: ${err.message}. Falling back to YouTube.`);
                // Fall through to YouTube search
            }
        }

        // STRATEGY 2: Official YouTube Search (Default / YouTube Modal)
        // Returns real YouTube Video IDs
        const r = await yts(query);
        const videos = r.videos.slice(0, 15).map(v => ({
            id: v.videoId,
            title: v.title,
            artist: v.author.name,
            author: v.author.name,
            duration: v.seconds,
            timestamp: v.timestamp,
            thumbnail: v.thumbnail,
            source: 'youtube'
        }));
        console.log(`[SEARCH] Found ${videos.length} YouTube tracks`);
        res.json(videos);

    } catch (error) {
        console.error('[SEARCH] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/stream', async (req, res) => {
    try {
        let videoId = req.query.videoId;
        if (!videoId) return res.status(400).json({ error: 'videoId required' });

        // Check if it is a Skysound ID (Base64) or YouTube ID
        let isSkysound = false;
        try {
            // Skysound IDs are base64 encoded URLs
            const decoded = Buffer.from(videoId, 'base64').toString('utf-8');
            if (decoded.startsWith('http')) {
                isSkysound = true;
            }
        } catch (e) {
            // Not base64 or not a URL, assume YouTube ID
        }

        if (isSkysound) {
            // ==========================================
            // SKYSOUND PROXY LOGIC
            // ==========================================
            const targetUrl = Buffer.from(videoId, 'base64').toString('utf-8');
            console.log(`[STREAM] Proxying Skysound: ${targetUrl}`);

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            };
            if (req.headers.range) headers['Range'] = req.headers.range;

            const upstreamRes = await fetch(targetUrl, { headers });

            res.status(upstreamRes.status);
            res.setHeader('Content-Type', upstreamRes.headers.get('Content-Type') || 'audio/mpeg');
            const contentLength = upstreamRes.headers.get('Content-Length');
            if (contentLength) res.setHeader('Content-Length', contentLength);
            res.setHeader('Accept-Ranges', 'bytes');
            if (upstreamRes.headers.has('Content-Range')) {
                res.setHeader('Content-Range', upstreamRes.headers.get('Content-Range'));
            }

            if (upstreamRes.body) {
                Readable.fromWeb(upstreamRes.body).pipe(res);
            } else {
                res.end();
            }

        } else {
            // ==========================================
            // YOUTUBE DOWNLOAD LOGIC
            // ==========================================
            console.log(`[STREAM] YouTube ID detected: ${videoId} | Prod: ${IS_PRODUCTION}`);

            // Strategy: Production -> RapidAPI, Local -> yt-dlp
            if (IS_PRODUCTION) {
                try {
                    console.log(`[STREAM] Using RapidAPI for ${videoId}`);
                    const downloadUrl = await fetchRapidAPI(videoId);
                    console.log(`[STREAM] RapidAPI Success: ${downloadUrl}`);

                    // Store metadata even in RapidAPI mode if we can (Background check)
                    const metadataPath = path.join(cacheDir, 'metadata.json');
                    if (!fs.existsSync(metadataPath) || !JSON.parse(fs.readFileSync(metadataPath, 'utf8'))[videoId]) {
                        console.log(`[METADATA] Background fetching missing info for ${videoId}...`);
                        yts({ videoId: videoId }).then(r => {
                            if (r) {
                                let metadata = {};
                                try { metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')); } catch (e) {}
                                metadata[videoId] = {
                                    id: r.videoId,
                                    title: r.title,
                                    artist: r.author.name,
                                    author: r.author.name,
                                    duration: r.seconds,
                                    timestamp: r.timestamp,
                                    thumbnail: r.thumbnail,
                                    source: 'youtube'
                                };
                                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                                console.log(`[METADATA] Background success for ${videoId}`);
                            }
                        }).catch(e => console.error(`[METADATA] Background error: ${e.message}`));
                    }

                    // Redirect to the final URL for efficiency
                    return res.redirect(downloadUrl);
                } catch (err) {
                    console.error(`[STREAM] RapidAPI failed: ${err.message}. Falling back to yt-dlp.`);
                    // Fallback to youtube-dl if RapidAPI fails (or quota exceeded)
                }
            }

            // FALLBACK / LOCALHOST: yt-dlp
            const cacheFilePath = path.join(cacheDir, `${videoId}.mp3`);
            const metadataPath = path.join(cacheDir, 'metadata.json');

            // 1. Ensure metadata is present
            try {
                let metadata = {};
                let metadataChanged = false;
                if (fs.existsSync(metadataPath)) {
                    try {
                        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    } catch (e) {
                        console.warn(`[METADATA] Error parsing metadata.json: ${e.message}`);
                        metadata = {};
                    }
                }

                if (!metadata[videoId]) {
                    console.log(`[METADATA] Fetching missing info for ${videoId}...`);
                    const r = await yts({ videoId: videoId });
                    if (r) {
                        metadata[videoId] = {
                            id: r.videoId,
                            title: r.title,
                            artist: r.author.name,
                            author: r.author.name,
                            duration: r.seconds,
                            timestamp: r.timestamp,
                            thumbnail: r.thumbnail,
                            source: 'youtube'
                        };
                        metadataChanged = true;
                    }
                }

                if (metadataChanged) {
                    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                }
            } catch (err) {
                console.warn(`[METADATA] Error handling metadata for ${videoId}: ${err.message}`);
            }

            // 2. Serve cache if exists
            if (fs.existsSync(cacheFilePath) && fs.statSync(cacheFilePath).size > 0) {
                const stat = fs.statSync(cacheFilePath);
                console.log(`[STREAM] Serving cached: ${videoId}`);
                res.writeHead(200, {
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': stat.size
                });
                fs.createReadStream(cacheFilePath).pipe(res);
                return;
            }

            // 3. Download if not exists
            console.log(`[STREAM] Using yt-dlp for ${videoId}`);
            const url = `https://www.youtube.com/watch?v=${videoId}`;

            await youtubedl(url, {
                output: cacheFilePath,
                format: 'bestaudio/best',
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: ['referer:youtube.com'],
                extractorArgs: 'youtube:player_client=android'
            });

            const stat = fs.statSync(cacheFilePath);
            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Length': stat.size
            });
            fs.createReadStream(cacheFilePath).pipe(res);
        }


    } catch (error) {
        console.error('[STREAM] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Stream failed' });
        }
    }
});

// Cache listing endpoint
app.get('/api/cache', (req, res) => {
    try {
        const metadataPath = path.join(cacheDir, 'metadata.json');
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } catch (e) {
                metadata = {};
            }
        }

        const files = fs.readdirSync(cacheDir)
            .filter(f => f.endsWith('.mp3'))
            .map(f => f.replace('.mp3', ''));

        const cachedTracks = [];
        for (const videoId of files) {
            if (metadata[videoId]) {
                cachedTracks.push(metadata[videoId]);
            } else {
                // If no metadata, return basic info
                cachedTracks.push({
                    id: videoId,
                    title: `Cached Track (${videoId})`,
                    artist: 'Unknown',
                    source: 'youtube'
                });
            }
        }

        res.json(cachedTracks);
    } catch (error) {
        console.error('[CACHE] Error scanning cache:', error);
        res.status(500).json({ error: 'Cache scan failed' });
    }
});

// Cache synchronization endpoint - fetches missing metadata
app.get('/api/cache/sync', async (req, res) => {
    try {
        const metadataPath = path.join(cacheDir, 'metadata.json');
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } catch (e) {
                metadata = {};
            }
        }

        const files = fs.readdirSync(cacheDir)
            .filter(f => f.endsWith('.mp3'))
            .map(f => f.replace('.mp3', ''));

        const missingIds = files.filter(id => !metadata[id]);
        
        if (missingIds.length === 0) {
            return res.json({ message: 'All tracks synchronized', count: 0 });
        }

        console.log(`[SYNC] Syncing ${missingIds.length} tracks...`);
        let syncedCount = 0;

        // Process in small batches to avoid rate limits
        for (const id of missingIds) {
            try {
                const r = await yts({ videoId: id });
                if (r) {
                    metadata[id] = {
                        id: r.videoId,
                        title: r.title,
                        artist: r.author.name,
                        author: r.author.name,
                        duration: r.seconds,
                        timestamp: r.timestamp,
                        thumbnail: r.thumbnail,
                        source: 'youtube'
                    };
                    syncedCount++;
                    // Optional: throttle if many IDs
                    if (syncedCount % 5 === 0) {
                        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                    }
                }
            } catch (err) {
                console.warn(`[SYNC] Failed to sync ${id}: ${err.message}`);
            }
        }

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        res.json({ message: `Successfully synced ${syncedCount} tracks`, count: syncedCount });

    } catch (error) {
        console.error('[SYNC] Error during synchronization:', error);
        res.status(500).json({ error: 'Synchronization failed' });
    }
});


// Version check endpoint for PWA updates
app.get('/api/version', (req, res) => {
    try {
        if (!staticDir) return res.json({ version: 'api-only' });

        const assetsDir = path.join(staticDir, 'assets');
        if (!fs.existsSync(assetsDir)) return res.json({ version: 'dev' });

        const files = fs.readdirSync(assetsDir);
        // Find index-*.js
        const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'));

        if (indexJs) {
            // Extract hash part "index-HASH.js" -> "HASH"
            // Start after "index-" (length 6) and remove ".js" (length 3)
            const version = indexJs.substring(6, indexJs.length - 3);
            res.json({ version: version, filename: indexJs });
        } else {
            res.json({ version: 'unknown', filename: null });
        }
    } catch (error) {
        console.error('[VERSION] Error checking version:', error);
        res.status(500).json({ error: 'Version check failed' });
    }
});

// Handle client-side routing
app.get('*', (req, res) => {
    if (staticDir) {
        const indexPath = path.join(staticDir, 'index.html');
        console.log(`[SERVER] Checking for index.html at: ${indexPath}`);
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
            return;
        }
    }

    res.status(404).send('App not ready (index.html not found). Please run build.');
});

app.listen(PORT, () => {
    console.log(`\n============================================`);
    console.log(`   🚀 SKYSOUND PROXY v5 - HYBRID MODE`);
    console.log(`   Mode: ${IS_PRODUCTION ? 'PRODUCTION (RapidAPI)' : 'DEVELOPMENT (Local DL)'}`);
    console.log(`   Serving static from: ${staticDir || 'NONE'}`);
    console.log(`   Server running on port ${PORT}`);
    console.log(`============================================\n`);
});