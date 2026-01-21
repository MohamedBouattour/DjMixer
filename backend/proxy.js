const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Invidious/Piped instances for anonymous YouTube access
// Only using instances with API enabled (api: true) and good uptime
// Updated 2026-01-21 - Most instances have disabled their API
const INVIDIOUS_INSTANCES = [
    'https://yewtu.be',  // API enabled, 98% uptime
    'https://vid.puffyan.us',
    'https://invidious.fdn.fr',
    'https://invidious.protokolla.fi'
];

// Piped API instances - most are offline, using known working ones
const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',  // 99.9% uptime, working as of 2026-01
    'https://pipedapi.kavin.rocks',
    'https://watchapi.whatever.social'
];

// Cobalt API instances - anonymous YouTube downloading service
// Source: https://instances.cobalt.best/ (verified working instances)
const COBALT_INSTANCES = [
    'https://cobalt-backend.canine.tools',  // 92% uptime
    'https://cobalt-api.meowing.de',        // 88% uptime
    'https://kityune.imput.net',            // 80% uptime (official)
    'https://blossom.imput.net',            // 80% uptime (official)
    'https://capi.3kh0.net'                 // 72% uptime
];

// Helper to fetch JSON from URL
async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchJSON(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON'));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// Helper to POST JSON to URL (for Cobalt API)
async function postJSON(url, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        const client = url.startsWith('https') ? https : http;
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.write(JSON.stringify(body));
        req.end();
    });
}

// Try to get audio URL from Cobalt API (anonymous, no auth required)
async function getAudioFromCobalt(videoId) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    for (const instance of COBALT_INSTANCES) {
        try {
            console.log(`Trying Cobalt: ${instance}`);
            const response = await postJSON(instance, {
                url: youtubeUrl,
                downloadMode: 'audio',
                audioFormat: 'mp3',
                audioBitrate: '128'
            });

            if (response.status === 'tunnel' || response.status === 'redirect') {
                console.log(`Found audio from Cobalt: ${response.url}`);
                return response.url;
            } else if (response.status === 'error') {
                console.log(`Cobalt ${instance} error: ${response.error?.code || 'unknown'}`);
            }
        } catch (err) {
            console.log(`Cobalt ${instance} failed: ${err.message}`);
        }
    }
    return null;
}

// Search using Invidious
async function searchInvidious(query) {
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            console.log(`Searching Invidious: ${instance}`);
            const encodedQuery = encodeURIComponent(query);
            const data = await fetchJSON(`${instance}/api/v1/search?q=${encodedQuery}&type=video`);

            if (Array.isArray(data) && data.length > 0) {
                const videos = data
                    .filter(v => v.type === 'video')
                    .slice(0, 10)
                    .map(v => ({
                        id: v.videoId,
                        title: v.title,
                        timestamp: formatDuration(v.lengthSeconds),
                        duration: v.lengthSeconds,
                        thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                        author: v.author
                    }));

                if (videos.length > 0) {
                    console.log(`Found ${videos.length} videos from Invidious`);
                    return videos;
                }
            }
        } catch (err) {
            console.log(`Invidious search ${instance} failed: ${err.message}`);
        }
    }
    return null;
}

// Search using Piped
async function searchPiped(query) {
    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`Searching Piped: ${instance}`);
            const encodedQuery = encodeURIComponent(query);
            const data = await fetchJSON(`${instance}/search?q=${encodedQuery}&filter=videos`);

            if (data.items && data.items.length > 0) {
                const videos = data.items
                    .filter(v => v.type === 'stream')
                    .slice(0, 10)
                    .map(v => ({
                        id: v.url?.replace('/watch?v=', '') || v.url?.split('/').pop(),
                        title: v.title,
                        timestamp: formatDuration(v.duration),
                        duration: v.duration,
                        thumbnail: v.thumbnail,
                        author: v.uploaderName
                    }));

                if (videos.length > 0) {
                    console.log(`Found ${videos.length} videos from Piped`);
                    return videos;
                }
            }
        } catch (err) {
            console.log(`Piped search ${instance} failed: ${err.message}`);
        }
    }
    return null;
}

// Format seconds to timestamp (e.g., "3:45")
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Try to get audio URL from Invidious
async function getAudioFromInvidious(videoId) {
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            console.log(`Trying Invidious: ${instance}`);
            const data = await fetchJSON(`${instance}/api/v1/videos/${videoId}`);

            // Find audio-only format
            const audioFormats = data.adaptiveFormats?.filter(f =>
                f.type?.startsWith('audio/') && f.url
            ) || [];

            if (audioFormats.length > 0) {
                // Sort by bitrate and get best
                const best = audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                console.log(`Found audio from Invidious: ${best.type}, ${best.bitrate}bps`);
                return best.url;
            }
        } catch (err) {
            console.log(`Invidious ${instance} failed: ${err.message}`);
        }
    }
    return null;
}

// Try to get audio URL from Piped
async function getAudioFromPiped(videoId) {
    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`Trying Piped: ${instance}`);
            const data = await fetchJSON(`${instance}/streams/${videoId}`);

            // Find audio stream
            const audioStreams = data.audioStreams?.filter(s => s.url) || [];

            if (audioStreams.length > 0) {
                // Sort by bitrate and get best
                const best = audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                console.log(`Found audio from Piped: ${best.mimeType}, ${best.bitrate}bps`);
                return best.url;
            }
        } catch (err) {
            console.log(`Piped ${instance} failed: ${err.message}`);
        }
    }
    return null;
}

// Download file from URL to path
async function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filePath);

        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.unlinkSync(filePath);
                downloadFile(res.headers.location, filePath).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        req.on('error', (err) => {
            fs.unlink(filePath, () => { });
            reject(err);
        });

        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

// Ensure cache directory exists
const cacheDir = process.env.CACHE_DIR || path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, 'public')));

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        console.log(`Searching for: ${query}`);
        let videos = null;

        // Strategy 1: Try Invidious (anonymous)
        videos = await searchInvidious(query);

        // Strategy 2: Try Piped (anonymous)
        if (!videos) {
            videos = await searchPiped(query);
        }

        // Strategy 3: Fallback to yt-search (uses YouTube directly)
        if (!videos) {
            console.log('Falling back to yt-search...');
            const r = await yts(query);
            videos = r.videos.slice(0, 10).map(v => ({
                id: v.videoId,
                title: v.title,
                timestamp: v.timestamp,
                duration: v.seconds,
                thumbnail: v.thumbnail,
                author: v.author.name
            }));
        }

        res.json(videos || []);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed', details: error.message });
    }
});

// Stream endpoint with caching
app.get('/stream', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        if (!videoId) {
            return res.status(400).json({ error: 'Query parameter "videoId" is required' });
        }

        const cacheFilePath = path.join(cacheDir, `${videoId}.mp3`);

        // Check if file is already in cache
        if (fs.existsSync(cacheFilePath)) {
            console.log(`Serving from cache: ${videoId}`);
            const stat = fs.statSync(cacheFilePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(cacheFilePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'audio/mpeg',
                };
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'audio/mpeg',
                    'Accept-Ranges': 'bytes',
                };
                res.writeHead(200, head);
                fs.createReadStream(cacheFilePath).pipe(res);
            }
            return;
        }

        console.log(`Getting stream for video: ${videoId}`);

        const tempFilePath = path.join(cacheDir, `${videoId}.download`);
        let audioUrl = null;
        let downloadSuccess = false;

        // Strategy 0: Try Cobalt API first (best for anonymous access, handles bot detection)
        console.log('Trying Cobalt API (anonymous)...');
        audioUrl = await getAudioFromCobalt(videoId);

        if (audioUrl) {
            try {
                console.log('Downloading from Cobalt...');
                await downloadFile(audioUrl, tempFilePath);
                downloadSuccess = true;
            } catch (err) {
                console.log(`Cobalt download failed: ${err.message}`);
            }
        }

        // Strategy 1: Try Invidious (anonymous)
        if (!downloadSuccess) {
            console.log('Trying Invidious sources...');
            audioUrl = await getAudioFromInvidious(videoId);

            if (audioUrl) {
                try {
                    console.log('Downloading from Invidious...');
                    await downloadFile(audioUrl, tempFilePath);
                    downloadSuccess = true;
                } catch (err) {
                    console.log(`Invidious download failed: ${err.message}`);
                }
            }
        }

        // Strategy 2: Try Piped (anonymous)
        if (!downloadSuccess) {
            audioUrl = await getAudioFromPiped(videoId);
            if (audioUrl) {
                try {
                    console.log('Downloading from Piped...');
                    await downloadFile(audioUrl, tempFilePath);
                    downloadSuccess = true;
                } catch (err) {
                    console.log(`Piped download failed: ${err.message}`);
                }
            }
        }

        // Strategy 3: Fallback to yt-dlp (requires cookies in production)
        if (!downloadSuccess) {
            console.log('Falling back to yt-dlp...');
            const url = `https://www.youtube.com/watch?v=${videoId}`;

            const cookiesPath = path.join(cacheDir, 'cookies.txt');
            const hasCookiesEnv = !!process.env.YOUTUBE_COOKIES;
            const hasPoToken = !!(process.env.YOUTUBE_PO_TOKEN && process.env.YOUTUBE_VISITOR_DATA);

            console.log(`Authentication status: YOUTUBE_COOKIES=${hasCookiesEnv ? 'SET' : 'NOT SET'}, PO_TOKEN=${hasPoToken ? 'SET' : 'NOT SET'}`);

            if (hasCookiesEnv) {
                fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
                console.log('Cookies file written from environment variable');
            }

            const downloadOptions = {
                output: tempFilePath,
                format: 'bestaudio/best',
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:https://www.youtube.com/',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                ]
            };

            if (fs.existsSync(cookiesPath)) {
                downloadOptions.cookies = cookiesPath;
                console.log('Using cookies file for authentication');
            } else if (!hasCookiesEnv) {
                console.warn('WARNING: No cookies available! YouTube will likely require authentication.');
                console.warn('Set YOUTUBE_COOKIES environment variable with your cookies.txt content.');
            }

            if (hasPoToken) {
                downloadOptions.extractorArgs = `youtube:player-client=web,default;po_token=web+${process.env.YOUTUBE_PO_TOKEN};visitor_data=${process.env.YOUTUBE_VISITOR_DATA}`;
                console.log('Using PO Token for authentication');
            }

            try {
                await youtubedl(url, downloadOptions);
                downloadSuccess = true;
                console.log('yt-dlp download successful');
            } catch (ytdlpError) {
                console.error('yt-dlp error:', ytdlpError.message);
                if (ytdlpError.message.includes('Sign in to confirm')) {
                    console.error('YouTube bot detection triggered. Authentication required.');
                    console.error('Please set YOUTUBE_COOKIES environment variable on Render.');
                }
                throw ytdlpError;
            }
        }

        if (!downloadSuccess) {
            return res.status(500).json({ error: 'All download methods failed' });
        }

        // Rename to final path
        if (fs.existsSync(tempFilePath)) {
            fs.renameSync(tempFilePath, cacheFilePath);
            console.log(`Saved to cache: ${cacheFilePath}`);
        }

        // Serve the newly cached file
        const stat = fs.statSync(cacheFilePath);
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(cacheFilePath).pipe(res);

    } catch (error) {
        console.error('Stream error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Stream failed', details: error.message });
        }
    }
});

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});

