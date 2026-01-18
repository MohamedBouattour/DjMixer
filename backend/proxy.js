const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Ensure cache directory exists
const cacheDir = path.join(__dirname, 'cache');
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

        const r = await yts(query);
        const videos = r.videos.slice(0, 10).map(v => ({
            id: v.videoId,
            title: v.title,
            timestamp: v.timestamp,
            duration: v.seconds,
            thumbnail: v.thumbnail,
            author: v.author.name
        }));

        res.json(videos);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
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
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // Create cookies file if env var exists
        if (process.env.YOUTUBE_COOKIES) {
            fs.writeFileSync('cookies.txt', process.env.YOUTUBE_COOKIES);
        }

        const ytOptions = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com']
        };

        if (fs.existsSync('cookies.txt')) {
            ytOptions.cookies = 'cookies.txt';
        }

        // Get info first
        const output = await youtubedl(url, ytOptions);

        // Find best audio format
        const audioFormats = output.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
        const bestAudio = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

        if (!bestAudio) {
            return res.status(404).json({ error: 'No audio format found' });
        }

        console.log(`Downloading best audio format: ${bestAudio.format_id}, bitrate: ${bestAudio.abr}kbps, ext: ${bestAudio.ext}`);

        // Download and cache
        const tempFilePath = path.join(cacheDir, `${videoId}.download`);

        const downloadOptions = {
            output: tempFilePath,
            format: 'bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: ['referer:youtube.com']
        };

        if (fs.existsSync('cookies.txt')) {
            downloadOptions.cookies = 'cookies.txt';
        }

        await youtubedl(url, downloadOptions);

        // Rename to final path
        fs.renameSync(tempFilePath, cacheFilePath);

        console.log(`Saved to cache: ${cacheFilePath}`);

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
            res.status(500).json({ error: 'Stream failed' });
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

