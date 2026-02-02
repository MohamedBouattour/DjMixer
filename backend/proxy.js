const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const { YtDlp, helpers } = require('ytdlp-nodejs');
const fs = require('fs');
const path = require('path');

// Initialize ytdlp instance
const ytdlp = new YtDlp();

const app = express();
const PORT = process.env.PORT || 3002;

const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

// Serve static files from the React app
// Priority: local 'public' folder (deployment) -> parent 'dist' folder (local fallback)
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, '../dist');

if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
} else {
    app.use(express.static(distDir));
}

app.use(cors());
app.use(express.json());

// SEARCH - Spotify Optimized
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const source = req.query.source;
        if (!query) return res.status(400).json({ error: 'Query required' });



        const searchQuery = `${query} official audio`;
        console.log(`[SEARCH] Query: "${searchQuery}"`);

        const r = await yts(searchQuery);

        const videos = r.videos.slice(0, 10).map(v => {
            let title = v.title;
            if (source === 'spotify') {
                title = title.replace(/\(Official.*?\)|\[Official.*?\]|Official Video|Official Audio|Lyric Video|Lyrics/gi, '').trim();
            }
            return {
                id: v.videoId,
                title: title,
                timestamp: v.timestamp,
                duration: v.seconds,
                thumbnail: v.thumbnail,
                author: v.author.name
            };
        });
        res.status(200).json(videos);
    } catch (error) {
        console.error('Search failed:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// STREAM - Original Stable Logic + Android Flow
app.get('/stream', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    const cacheFilePath = path.join(cacheDir, `${videoId}.mp3`);

    // 1. Serve from cache
    if (fs.existsSync(cacheFilePath) && fs.statSync(cacheFilePath).size > 0) {
        const stat = fs.statSync(cacheFilePath);
        const range = req.headers.range;

        console.log(`[CACHE] Providing: ${videoId}`);

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': (end - start) + 1,
                'Content-Type': 'audio/mpeg'
            });
            return fs.createReadStream(cacheFilePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' });
            return fs.createReadStream(cacheFilePath).pipe(res);
        }
    }

    // 2. Download using ytdlp-nodejs
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        console.log(`[YTDLP-v4] Downloading audio for: ${videoId}`);

        if (fs.existsSync(cacheFilePath)) fs.unlinkSync(cacheFilePath);

        // Use ytdlp-nodejs with raw args to avoid postprocessing (no FFmpeg needed)
        const outputTemplate = path.join(cacheDir, `${videoId}.%(ext)s`);
        const result = await ytdlp.downloadAsync(url, {
            output: outputTemplate,
            rawArgs: [
                '-f', 'bestaudio/best',
                '--no-post-overwrites',
                '--extractor-args', 'youtube:player_client=android'
            ],
            onProgress: (p) => console.log(`[PROGRESS] ${videoId}: ${p.percentage_str || p.percent || '...'}`)
        });

        console.log(`[SUCCESS] Downloaded: ${videoId}`, result.filePaths);

        // Find the downloaded file (might be different extension)
        let finalPath = cacheFilePath;
        if (result.filePaths && result.filePaths.length > 0) {
            finalPath = result.filePaths[0];
        }

        if (!fs.existsSync(finalPath)) {
            // Try to find any file with the videoId prefix
            const files = fs.readdirSync(cacheDir).filter(f => f.startsWith(videoId));
            if (files.length > 0) {
                finalPath = path.join(cacheDir, files[0]);
            }
        }

        const stat = fs.statSync(finalPath);
        console.log(`[SERVING] File: ${finalPath} (${stat.size} bytes)`);

        // Determine content type based on extension
        const ext = path.extname(finalPath).toLowerCase();
        const contentTypes = {
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.webm': 'audio/webm',
            '.ogg': 'audio/ogg',
            '.opus': 'audio/opus',
            '.wav': 'audio/wav'
        };
        const contentType = contentTypes[ext] || 'audio/mpeg';
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': contentType, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(finalPath).pipe(res);
    } catch (error) {
        console.error('[YTDLP FAILED]:', error.message || error);
        if (!res.headersSent) res.status(500).json({ error: 'Stream error', details: error.message });
    }
});

// The catch-all handler for any request that doesn't match the one above
app.get('*', (req, res) => {
    if (fs.existsSync(path.join(publicDir, 'index.html'))) {
        res.sendFile(path.join(publicDir, 'index.html'));
    } else {
        res.sendFile(path.join(distDir, 'index.html'));
    }
});

// Startup function to ensure yt-dlp is installed
async function startServer() {
    try {
        // Check if yt-dlp is installed, if not download it
        const installed = await ytdlp.checkInstallationAsync();
        if (!installed) {
            console.log('[SETUP] yt-dlp not found, downloading...');
            await helpers.downloadYtDlp();
            console.log('[SETUP] yt-dlp installed successfully!');
        } else {
            console.log('[SETUP] yt-dlp binary found.');
        }

        // Try to update yt-dlp to latest version
        try {
            const updateResult = await ytdlp.updateYtDlpAsync();
            console.log(`[SETUP] yt-dlp version: ${updateResult.version}`);
        } catch (e) {
            console.log('[SETUP] Could not update yt-dlp, using current version.');
        }

        // Try to download FFmpeg if not present
        try {
            const ffmpegInstalled = await ytdlp.checkInstallationAsync({ ffmpeg: true });
            if (!ffmpegInstalled) {
                console.log('[SETUP] FFmpeg not found, downloading...');
                await ytdlp.downloadFFmpeg();
                console.log('[SETUP] FFmpeg installed successfully!');
            } else {
                console.log('[SETUP] FFmpeg found.');
            }
        } catch (e) {
            console.log('[SETUP] Could not install FFmpeg, audio conversion may be limited.');
        }
    } catch (error) {
        console.error('[SETUP] Warning: Could not verify yt-dlp installation:', error.message);
    }

    app.listen(PORT, () => {
        console.log(`\n============================================`);
        console.log(`   🚀 PROXY v4.0 - YTDLP-NODEJS ACTIVE`);
        console.log(`   Server running on port ${PORT}`);
        console.log(`============================================\n`);
    });
}

startServer();