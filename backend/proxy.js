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
const logsDir = path.join(__dirname, 'logs');
let staticDir = null;

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Setup log stream
const logFile = path.join(logsDir, 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'w' });

function writeToLogFile(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    logStream.write(`[${timestamp}] [${level}] ${message}\n`);
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
    writeToLogFile('INFO', args);
    originalLog.apply(console, args);
};
console.warn = (...args) => {
    writeToLogFile('WARN', args);
    originalWarn.apply(console, args);
};
console.error = (...args) => {
    writeToLogFile('ERROR', args);
    originalError.apply(console, args);
};

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

// Helper for cleaning YouTube titles and extracting clean artist & title
function parseTrackMetadata(videoTitle, channelName) {
    if (!videoTitle) return { artist: 'Unknown Artist', title: 'Unknown Title' };

    // Standardize spacing around hyphens
    let clean = videoTitle
        .replace(/\s+-\s*/g, ' - ')
        .replace(/\s*-\s+/g, ' - ');

    // Clean standard tags in brackets/braces
    clean = clean
        .replace(/\[\s*(official\s+video|official\s+audio|official\s+music\s+video|official\s+lyric\s+video|lyric\s+video|lyrics|official|audio|video|hd|hq|1080p|4k|visualizer|clip\s+officiel)\s*\]/gi, '')
        .replace(/\(\s*(official\s+video|official\s+audio|official\s+music\s+video|official\s+lyric\s+video|lyric\s+video|lyrics|official|audio|video|hd|hq|1080p|4k|visualizer|clip\s+officiel)\s*\)/gi, '')
        .trim();

    const separators = [' - ', ' – ', ' — ', ' | ', ' : ', ' / '];
    let leftmostSep = null;
    let leftmostIdx = Infinity;

    for (const sep of separators) {
        const idx = clean.indexOf(sep);
        if (idx !== -1 && idx < leftmostIdx) {
            leftmostIdx = idx;
            leftmostSep = sep;
        }
    }

    let artist = '';
    let songTitle = '';

    if (leftmostSep) {
        const parts = clean.split(leftmostSep);
        artist = parts[0].trim();
        songTitle = parts.slice(1).join(leftmostSep).trim();
    } else {
        // Fallback to split by any hyphen
        const match = clean.match(/^([^-]+)-+(.+)$/);
        if (match) {
            artist = match[1].trim();
            songTitle = match[2].trim();
        }
    }

    // Identify generic/lyrics channel names
    const lowerChannel = (channelName || '').toLowerCase();
    const isGenericChannel = lowerChannel.includes('topic') || 
                             lowerChannel.includes('lyrics') || 
                             lowerChannel.includes('music') || 
                             lowerChannel.includes('vevo') || 
                             lowerChannel.includes('records') ||
                             lowerChannel.includes('studio') ||
                             lowerChannel.includes('uploads') ||
                             lowerChannel.includes('soundtrack') ||
                             lowerChannel.includes('channel') ||
                             lowerChannel.includes('mp3') ||
                             lowerChannel.includes('karaoke') ||
                             lowerChannel.includes('sound');

    // If no artist/title could be split or the artist part is too long, use channelName (if not generic)
    if (!artist || !songTitle || artist.length > 50) {
        if (channelName && !isGenericChannel) {
            artist = channelName;
            songTitle = clean;
        } else {
            artist = 'Unknown Artist';
            songTitle = clean;
        }
    } else {
        // If parsed artist is generic or looks like a channel name, try to split the title part further
        const parsedArtistLower = artist.toLowerCase();
        const isArtistGeneric = parsedArtistLower.includes('topic') || 
                                parsedArtistLower.includes('lyrics') || 
                                parsedArtistLower.includes('music') || 
                                parsedArtistLower.includes('vevo') || 
                                parsedArtistLower.includes('records') ||
                                parsedArtistLower.includes('studio') ||
                                parsedArtistLower.includes('uploads') ||
                                parsedArtistLower.includes('soundtrack') ||
                                parsedArtistLower.includes('channel') ||
                                parsedArtistLower.includes('sound') ||
                                parsedArtistLower.length > 35;

        if (isArtistGeneric && songTitle) {
            let subLeftmostSep = null;
            let subLeftmostIdx = Infinity;
            for (const sep of [...separators, '-']) {
                const idx = songTitle.indexOf(sep);
                if (idx !== -1 && idx < subLeftmostIdx) {
                    subLeftmostIdx = idx;
                    subLeftmostSep = sep;
                }
            }
            if (subLeftmostSep) {
                const subParts = songTitle.split(subLeftmostSep);
                const subArtist = subParts[0].trim();
                const subTitle = subParts.slice(1).join(subLeftmostSep).trim();
                if (subArtist && subTitle && subArtist.length < 35) {
                    artist = subArtist;
                    songTitle = subTitle;
                }
            }
        }
    }

    // Strip outer quotes and clean up formatting
    artist = artist.replace(/^["'«\s]+|["'»\s]+$/g, '').trim();
    songTitle = songTitle.replace(/^["'«\s]+|["'»\s]+$/g, '').trim();

    return { artist, title: songTitle };
}

function getNormalizedString(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF]/g, '') // Keep alphanumeric and Arabic characters
        .replace(/official/g, '')
        .replace(/video/g, '')
        .replace(/audio/g, '')
        .replace(/lyrics/g, '')
        .replace(/lyric/g, '')
        .replace(/original/g, '')
        .replace(/mix/g, '')
        .replace(/remix/g, '')
        .replace(/cover/g, '')
        .replace(/full/g, '')
        .replace(/song/g, '')
        .trim();
}

function getLcs(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}

function areTitlesSimilar(t1, t2) {
    const n1 = getNormalizedString(t1);
    const n2 = getNormalizedString(t2);
    if (!n1 || !n2) return false;
    if (n1.includes(n2) || n2.includes(n1)) return true;
    
    const lcs = getLcs(n1, n2);
    const minLen = Math.min(n1.length, n2.length);
    if (minLen === 0) return false;
    
    return (lcs / minLen) > 0.75;
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

app.delete('/api/users/:uid/tracks/:trackId', (req, res) => {
    try {
        const uid = req.params.uid;
        const trackId = req.params.trackId;
        const delStmt = db.prepare('DELETE FROM user_tracks WHERE user_id = ? AND track_id = ?');
        delStmt.run(uid, trackId);
        console.log(`[USER_TRACKS] Deleted track ${trackId} for user ${uid}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[USER_TRACKS] Error deleting track:', error);
        res.status(500).json({ error: 'Failed to delete user track' });
    }
});

app.get('/api/logs', (req, res) => {
    try {
        if (fs.existsSync(logFile)) {
            res.download(logFile, 'app.log');
        } else {
            res.status(404).json({ error: 'Log file not found' });
        }
    } catch (error) {
        originalError('[LOGS_ENDPOINT] Error downloading log file:', error);
        res.status(500).json({ error: 'Failed to retrieve logs' });
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
        const videos = r.videos.slice(0, 15).map(v => {
            const parsed = parseTrackMetadata(v.title, v.author?.name);
            return {
                id: v.videoId,
                title: parsed.title,
                artist: parsed.artist,
                author: v.author?.name || parsed.artist,
                duration: v.seconds,
                timestamp: v.timestamp,
                thumbnail: v.thumbnail,
                source: 'youtube'
            };
        });
        console.log(`[SEARCH] Found ${videos.length} YouTube tracks`);
        res.json(videos);

    } catch (error) {
        console.error('[SEARCH] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── Auto Mix: BPM-based track suggestion ──────────────────────────────────
app.get('/api/suggest', async (req, res) => {
    try {
        const bpm = parseInt(req.query.bpm);
        const exclude = req.query.exclude || ''; // comma-separated IDs to skip
        if (!bpm || isNaN(bpm)) return res.status(400).json({ error: 'bpm required' });

        const genres = ['house', 'techno', 'edm', 'dance', 'electronic', 'hip hop', 'pop', 'remix'];
        const genre = genres[Math.floor(Math.random() * genres.length)];
        const query = `${genre} radio edit`;

        console.log(`[SUGGEST] Searching: "${query}" (target BPM: ${bpm})`);

        const r = await yts(query);
        const excludeSet = new Set(exclude.split(',').filter(Boolean));
        const videos = r.videos
            .filter(v => !excludeSet.has(v.videoId) && v.seconds > 60 && v.seconds < 600)
            .slice(0, 5)
            .map(v => {
                const parsed = parseTrackMetadata(v.title, v.author?.name);
                return {
                    id: v.videoId,
                    title: parsed.title,
                    name: parsed.title,
                    artist: parsed.artist,
                    author: v.author?.name || parsed.artist,
                    duration: v.seconds,
                    timestamp: v.timestamp,
                    thumbnail: v.thumbnail,
                    source: 'youtube'
                };
            });

        console.log(`[SUGGEST] Found ${videos.length} suggestions for ${bpm} BPM`);
        res.json(videos);
    } catch (error) {
        console.error('[SUGGEST] Error:', error);
        res.status(500).json({ error: 'Suggestion failed' });
    }
});

// ─── Smart Mix V2: AI suggests real song names, YouTube finds them ─
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

app.post('/api/smart-suggest', express.json(), async (req, res) => {
    try {
        const { name, artist, bpm, genre, playedIds } = req.body;
        const currentBpm = parseInt(bpm) || 120;
        const excludeSet = new Set(playedIds || []);

        // Clean/Parse the seed track info
        const seedParsed = parseTrackMetadata(name, artist);
        const cleanName = seedParsed.title;
        const cleanArtist = seedParsed.artist !== 'Unknown Artist' ? seedParsed.artist : (artist || '');
        const trackLabel = `${cleanArtist ? cleanArtist + ' - ' : ''}${cleanName || 'Unknown'}`;

        console.log(`\n========== SMART-SUGGEST REQUEST ==========`);
        console.log(`Track:  "${trackLabel}"`);
        console.log(`BPM:    ${currentBpm}`);
        console.log(`Genre:  ${genre || '?'}`);
        console.log(`Artist: ${cleanArtist || '?'}`);
        console.log(`Played: ${playedIds?.length || 0} IDs`);
        console.log(`Has AI key: ${OPENROUTER_KEY ? 'YES' : 'NO'}`);
        console.log(`Model:  ${OPENROUTER_MODEL}`);

        let suggestions = [];

        // Try AI first
        if (OPENROUTER_KEY) {
            console.log(`[SMART-SUGGEST] Calling OpenRouter...`);
            try {
                suggestions = await aiSuggest(cleanName, cleanArtist, currentBpm, genre, excludeSet, trackLabel);
                console.log(`[SMART-SUGGEST] AI returned ${suggestions.length} real tracks`);
                if (suggestions.length > 0) {
                    console.log(`[SMART-SUGGEST] Final response:`);
                    suggestions.forEach((s, i) => console.log(`  ${i+1}. "${s.title}" - ${s.artist} (yt:${s.videoId})`));
                    console.log(`============================================\n`);
                    return res.json({ suggestions, ai: true });
                }
            } catch (e) {
                console.warn(`[SMART-SUGGEST] AI failed:`, e.message);
                if (e.stack) console.warn(e.stack.split('\n').slice(0, 4).join('\n'));
            }
        }

        // Fallback: context-aware YouTube search (use current artist, name and genre to find smart matching suggestions)
        console.log(`[SMART-SUGGEST] FALLBACK: context-aware query search`);
        const genres = ['house', 'techno', 'edm', 'dance', 'electronic', 'hip hop', 'pop', 'remix'];
        const currentGenre = genre || genres[Math.floor(Math.random() * genres.length)];
        
        let fallbackQuery = '';
        if (cleanArtist && cleanName) {
            fallbackQuery = `${cleanArtist} similar tracks`;
        } else if (cleanArtist) {
            fallbackQuery = `${cleanArtist} ${currentGenre} mix`;
        } else if (cleanName) {
            fallbackQuery = `${cleanName} ${currentGenre} similar`;
        } else {
            fallbackQuery = `${currentGenre} dj mix radio edit`;
        }

        console.log(`[SMART-SUGGEST] Query: "${fallbackQuery}"`);
        const r = await yts(fallbackQuery);
        const rawVideos = r.videos || [];
        console.log(`[SMART-SUGGEST] YouTube returned ${rawVideos.length} raw results`);

        const seedNormTitle = getNormalizedString(cleanName);
        
        const fbVideos = [];
        const seenNormalizedTitles = new Set();
        if (seedNormTitle) {
            seenNormalizedTitles.add(seedNormTitle);
        }

        for (const v of rawVideos) {
            if (fbVideos.length >= 4) break;

            if (excludeSet.has(v.videoId)) continue;
            if (v.seconds <= 60 || v.seconds >= 600) continue;

            const parsed = parseTrackMetadata(v.title, v.author?.name);
            const normTitle = getNormalizedString(parsed.title);

            // Similarity check
            let isDuplicate = false;
            for (const seenTitle of seenNormalizedTitles) {
                if (areTitlesSimilar(parsed.title, seenTitle)) {
                    isDuplicate = true;
                    break;
                }
                const n1 = normTitle;
                const n2 = getNormalizedString(seenTitle);
                if (n1.includes(n2) || n2.includes(n1)) {
                    isDuplicate = true;
                    break;
                }
            }

            if (isDuplicate) {
                console.log(`[SMART-SUGGEST] Skipping duplicate suggestion: "${v.title}"`);
                continue;
            }

            seenNormalizedTitles.add(normTitle);
            
            fbVideos.push({
                id: v.videoId,
                title: parsed.title,
                artist: parsed.artist || cleanArtist || 'Unknown',
                genre: currentGenre,
                bpm: currentBpm,
                reason: parsed.artist && parsed.artist !== 'Unknown Artist'
                    ? `Matches energy and style of ${parsed.artist}`
                    : `Good match for ${currentGenre} style at ${currentBpm} BPM`,
                status: 'found',
                thumbnail: v.thumbnail,
                duration: v.seconds,
                videoId: v.videoId,
            });
        }

        console.log(`[SMART-SUGGEST] Fallback returning ${fbVideos.length} tracks`);
        fbVideos.forEach((s, i) => console.log(`  ${i+1}. "${s.title}" - ${s.artist} (yt:${s.videoId})`));
        console.log(`============================================\n`);
        res.json({ suggestions: fbVideos, ai: false });
    } catch (error) {
        console.error(`[SMART-SUGGEST] UNCAUGHT ERROR:`, error);
        res.json({ suggestions: [], ai: false });
    }
});

async function aiSuggest(name, artist, bpm, genre, excludeSet, trackLabel) {
    const modelsToTry = [];
    if (process.env.OPENROUTER_MODEL) {
        modelsToTry.push(process.env.OPENROUTER_MODEL);
    }
    // List of premium and capable free models on OpenRouter
    const freeModelsList = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct:free'
    ];
    for (const m of freeModelsList) {
        if (!modelsToTry.includes(m)) {
            modelsToTry.push(m);
        }
    }

    let aiSongs = [];
    let usedModel = '';

    for (const model of modelsToTry) {
        console.log(`[AI-SUGGEST] Trying OpenRouter model: ${model}...`);
        try {
            const prompt = [
                `You are a professional DJ music recommendation engine. Given the current track, suggest exactly 4 real, well-known songs that would mix well after it.`,
                ``,
                `Current track:`,
                `  Title: ${name || 'Unknown'}`,
                `  Artist: ${artist || 'Unknown'}`,
                `  BPM: ${bpm}`,
                `  Genre: ${genre || 'Unknown'}`,
                ``,
                `Requirements:`,
                `- Each song MUST be a real, existing track by a real artist.`,
                `- Songs must match the energy, style, key compatibility, or genre of the current track.`,
                `- Prefer songs with similar BPM (within ±15%).`,
                `- Include a mix of known hits and deeper cuts that fit the vibe.`,
                `- DO NOT make up songs or artists.`,
                `- DO NOT use generic placeholders — provide the actual song title and artist.`,
                ``,
                `Return ONLY a valid JSON object with a single key "recommendations" containing an array of exactly 4 objects with these fields:`,
                `  title: string (the full song title)`,
                `  artist: string (the full artist name)`,
                `  reason: string (1 sentence explaining why it mixes well)`,
                ``,
                `Example:`,
                `{`,
                `  "recommendations": [`,
                `    {"title": "Strobe", "artist": "deadmau5", "reason": "Progressive house with a similar build-up energy and key compatibility"}`,
                `  ]`,
                `}`,
                ``,
                `Return ONLY the JSON object, no other text, no markdown, no code fences.`,
            ].join('\n');

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://djmixer.app',
                    'X-Title': 'DJ Mixer',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' },
                    temperature: 0.7,
                    max_tokens: 800,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenRouter HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new Error('Empty AI response');

            let parsed = null;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                // Try regex extraction of JSON
                const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
                if (match) {
                    parsed = JSON.parse(match[0]);
                } else {
                    throw new Error('No JSON object found in response');
                }
            }

            let songs = parsed.recommendations || parsed.songs || parsed.suggestions || [];
            if (!Array.isArray(songs) && typeof parsed === 'object') {
                const keys = Object.keys(parsed);
                for (const key of keys) {
                    if (Array.isArray(parsed[key])) {
                        songs = parsed[key];
                        break;
                    }
                }
            }
            if (!Array.isArray(songs)) {
                songs = Array.isArray(parsed) ? parsed : [];
            }

            if (songs.length > 0) {
                aiSongs = songs;
                usedModel = model;
                break; // Success, exit retry loop
            } else {
                throw new Error('Recommendations array is empty');
            }
        } catch (err) {
            console.warn(`[AI-SUGGEST] Model ${model} failed: ${err.message}. Retrying...`);
        }
    }

    if (aiSongs.length === 0) {
        throw new Error('All AI models failed or returned empty results');
    }

    console.log(`[AI-SUGGEST] Success with model: ${usedModel}`);
    console.log(`[AI-SUGGEST] AI suggested ${aiSongs.length} songs:`);
    aiSongs.slice(0, 4).forEach((s, i) => console.log(`  ${i+1}. "${s.title}" by ${s.artist} — ${(s.reason || '').substring(0, 80)}`));

    // For each AI suggestion, search YouTube to find the real video
    const results = [];
    for (const song of aiSongs.slice(0, 4)) {
        const songTitle = (song.title || '').trim();
        const songArtist = (song.artist || '').trim();
        const reason = (song.reason || `Matches the vibe of "${name}"`).trim();
        if (!songTitle) {
            console.log(`[AI-SUGGEST] Skipping song with no title`);
            continue;
        }

        const searchQuery = songArtist ? `${songArtist} - ${songTitle} official audio` : `${songTitle} official audio`;
        console.log(`[AI-SUGGEST] YouTube search #1: "${searchQuery}"`);
        try {
            const r = await yts(searchQuery);
            console.log(`[AI-SUGGEST]   returned ${r.videos?.length || 0} results`);
            const video = r.videos?.find(v =>
                !excludeSet.has(v.videoId) &&
                v.seconds > 60 &&
                v.seconds < 600
            );
            if (video) {
                console.log(`[AI-SUGGEST]   FOUND: "${video.title}" (${video.videoId})`);
                excludeSet.add(video.videoId);
                const parsed = parseTrackMetadata(video.title, video.author?.name || songArtist);
                results.push({
                    id: video.videoId,
                    title: parsed.title,
                    artist: parsed.artist || songArtist,
                    genre: genre || 'Music',
                    bpm: bpm,
                    reason,
                    status: 'found',
                    thumbnail: video.thumbnail,
                    duration: video.seconds,
                    videoId: video.videoId,
                });
            } else {
                console.log(`[AI-SUGGEST]   no suitable video found (all excluded, too short, or too long)`);
            }
        } catch (e) {
            console.warn(`[AI-SUGGEST] YouTube search failed for "${searchQuery}":`, e.message);
        }
    }

    if (results.length === 0) {
        console.log(`[AI-SUGGEST] No results from primary search, trying broader queries...`);
        // Try broader search for each song
        for (const song of aiSongs.slice(0, 4)) {
            const songTitle = (song.title || '').trim();
            const songArtist = (song.artist || '').trim();
            const reason = (song.reason || `Matches the vibe of "${name}"`).trim();
            if (!songTitle) continue;

            const searchQuery = songArtist ? `${songArtist} ${songTitle}` : songTitle;
            console.log(`[AI-SUGGEST] YouTube search #2: "${searchQuery}"`);
            try {
                const r = await yts(searchQuery);
                console.log(`[AI-SUGGEST]   returned ${r.videos?.length || 0} results`);
                const video = r.videos?.find(v =>
                    !excludeSet.has(v.videoId) &&
                    v.seconds > 60 &&
                    v.seconds < 600
                );
                if (video) {
                    console.log(`[AI-SUGGEST]   FOUND: "${video.title}" (${video.videoId})`);
                    excludeSet.add(video.videoId);
                    const parsed = parseTrackMetadata(video.title, video.author?.name || songArtist);
                    results.push({
                        id: video.videoId,
                        title: parsed.title,
                        artist: parsed.artist || songArtist,
                        genre: genre || 'Music',
                        bpm: bpm,
                        reason,
                        status: 'found',
                        thumbnail: video.thumbnail,
                        duration: video.seconds,
                        videoId: video.videoId,
                    });
                } else {
                    console.log(`[AI-SUGGEST]   no suitable video found`);
                }
            } catch (e) {
                console.warn(`[AI-SUGGEST] Fallback search failed for "${searchQuery}":`, e.message);
            }
        }
    }

    console.log(`[AI-SUGGEST] Total YouTube matches: ${results.length}/${aiSongs.length}`);
    return results;
}

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
                                const parsed = parseTrackMetadata(r.title, r.author?.name);
                                metadata[videoId] = {
                                    id: r.videoId,
                                    title: parsed.title,
                                    artist: parsed.artist,
                                    author: r.author?.name || parsed.artist,
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
                        const parsed = parseTrackMetadata(r.title, r.author?.name);
                        metadata[videoId] = {
                            id: r.videoId,
                            title: parsed.title,
                            artist: parsed.artist,
                            author: r.author?.name || parsed.artist,
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

// Global cache APIs removed (users now have their own synced profiles)


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