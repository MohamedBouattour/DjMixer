const fs = require('fs');
const dotenv = require('dotenv');

// Check for secrets in VPS mount path (e.g. Render)
const secretPath = '/etc/secrets/.env';
if (fs.existsSync(secretPath)) {
    console.log('[CONFIG] Loading secrets from /etc/secrets/.env');
    dotenv.config({ path: secretPath });
} else {
    // Fallback to local .env
    dotenv.config();
}
const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const path = require('path');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');

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
let staticDir = null;

if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

if (fs.existsSync(publicPath)) {
    console.log(`[SERVER] Serving static files from ${publicPath}`);
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

app.get('/search', async (req, res) => {
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

app.get('/stream', async (req, res) => {
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

                    // Redirect to the final URL for efficiency
                    return res.redirect(downloadUrl);
                } catch (err) {
                    console.error(`[STREAM] RapidAPI failed: ${err.message}. Falling back to yt-dlp.`);
                    // Fallback to youtube-dl if RapidAPI fails (or quota exceeded)
                }
            }

            // FALLBACK / LOCALHOST: yt-dlp
            const cacheFilePath = path.join(cacheDir, `${videoId}.mp3`);

            // Serve cache if exists
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

// Version check endpoint for PWA updates
app.get('/version', (req, res) => {
    try {
        if (!staticDir) return res.status(503).json({ error: 'Static dir not loaded' });

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