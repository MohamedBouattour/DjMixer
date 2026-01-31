const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3002;

const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

// SEARCH - Spotify Optimized
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const source = req.query.source;
        if (!query) return res.status(400).json({ error: 'Query required' });

        console.log(`[SEARCH] Query: "${query}" | Mode: ${source || 'youtube'}`);

        const searchQuery = source === 'spotify' ? `${query} official audio` : query;
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

    // 2. Download using Android Client (The bypass)
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        console.log(`[BYPASS-v3] Attempting Bypass for: ${videoId} (No Cookies Mode)`);

        if (fs.existsSync(cacheFilePath)) fs.unlinkSync(cacheFilePath);

        // We use extractor-args to tell YouTube we are an Android device
        // This is a known technique to skip 403 blocks on many official tracks
        await youtubedl(url, {
            output: cacheFilePath,
            format: 'bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: ['referer:youtube.com'],
            extractorArgs: 'youtube:player_client=android'
        });

        const stat = fs.statSync(cacheFilePath);
        console.log(`[SUCCESS] Downloaded: ${videoId} (${stat.size} bytes)`);

        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' });
        fs.createReadStream(cacheFilePath).pipe(res);
    } catch (error) {
        console.error('[BYPASS FAILED]:', error.message);
        if (!res.headersSent) res.status(500).send('Stream error');
    }
});

app.listen(PORT, () => {
    console.log(`\n============================================`);
    console.log(`   🚀 PROXY v3.0 - ANDROID BYPASS ACTIVE`);
    console.log(`   The bypass protocol is running.`);
    console.log(`============================================\n`);
});
