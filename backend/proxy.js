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
// These rotate to avoid rate limiting
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://iv.datura.network',
    'https://invidious.private.coffee',
    'https://yt.drgnz.club'
];

const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.r4fo.com',
    'https://api.piped.yt'
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

        // Strategy 1: Try Invidious (anonymous)
        console.log('Trying anonymous sources first...');
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
            if (process.env.YOUTUBE_COOKIES) {
                fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
            }

            const downloadOptions = {
                output: tempFilePath,
                format: 'bestaudio/best',
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:https://www.youtube.com/',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]
            };

            if (fs.existsSync(cookiesPath)) {
                downloadOptions.cookies = cookiesPath;
            }

            if (process.env.YOUTUBE_PO_TOKEN && process.env.YOUTUBE_VISITOR_DATA) {
                downloadOptions.extractorArgs = `youtube:player-client=web,default;po_token=web+${process.env.YOUTUBE_PO_TOKEN};visitor_data=${process.env.YOUTUBE_VISITOR_DATA}`;
            }

            await youtubedl(url, downloadOptions);
            downloadSuccess = true;
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

