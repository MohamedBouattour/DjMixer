const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const { Innertube, UniversalCache } = require('youtubei.js');
const fs = require('fs');
const path = require('path');

// Initialize Innertube
// We will create specific clients as needed or use a default one
let yt = null;

async function getInnertube() {
    if (yt) return yt;
    yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
    });
    return yt;
}

(async () => {
    try {
        await getInnertube();
        console.log('[SETUP] InnerTube (youtubei.js) initialized.');
    } catch (e) {
        console.error('[SETUP] Failed to initialize InnerTube:', e);
    }
})();

const app = express();
const PORT = process.env.PORT || 3002;

const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

// Serve static files from the React app
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, '../dist');

if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
} else {
    app.use(express.static(distDir));
}

app.use(cors());
app.use(express.json());

// SEARCH
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

// STREAM - Multi-Client Fallback Strategy
app.get('/stream', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    // Check cache
    let existingFile = null;
    if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir).filter(f => f.startsWith(videoId));
        if (files.length > 0) existingFile = path.join(cacheDir, files[0]);
    }

    if (existingFile && fs.statSync(existingFile).size > 0) {
        const stat = fs.statSync(existingFile);

        // Simple cache serving without range support for reliability test? 
        // No, keep range support, it's good for scrubbing.
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Content-Length': (end - start) + 1,
                'Content-Type': 'audio/mp4',
                'Accept-Ranges': 'bytes'
            });
            return fs.createReadStream(existingFile, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': stat.size,
                'Content-Type': 'audio/mp4',
                'Accept-Ranges': 'bytes'
            });
            return fs.createReadStream(existingFile).pipe(res);
        }
    }

    // Download Strategy
    try {
        const innertube = await getInnertube();
        const outputFilePath = path.join(cacheDir, `${videoId}.m4a`);

        // List of clients to try in order of likely success/permissiveness
        // Prioritize Music clients for music content
        const clientsToTry = ['YTMUSIC', 'YTMUSIC_ANDROID', 'WEB', 'ANDROID', 'IOS', 'TV_EMBEDDED'];

        let stream = null;
        let lastError = null;

        for (const clientName of clientsToTry) {
            try {
                console.log(`[YOUTUBEI] Attempting download for ${videoId} using client: ${clientName}`);

                stream = await innertube.download(videoId, {
                    type: 'audio',
                    quality: 'best',
                    format: 'mp4',
                    client: clientName
                });

                if (stream) {
                    console.log(`[YOUTUBEI] Success with client: ${clientName}`);
                    break;
                }
            } catch (e) {
                console.warn(`[YOUTUBEI] Client ${clientName} failed: ${e.message}`);
                lastError = e;
                // If the error is 403 or Login Required, we continue. 
                // Some clients might work.
            }
        }

        if (!stream) {
            throw new Error(`All clients failed. Last error: ${lastError?.message}`);
        }

        const file = fs.createWriteStream(outputFilePath);
        for await (const chunk of stream) {
            file.write(chunk);
        }

        await new Promise((resolve, reject) => {
            file.on('finish', resolve);
            file.on('error', reject);
            file.end();
        });

        console.log(`[SUCCESS] Downloaded: ${videoId}`);

        const stat = fs.statSync(outputFilePath);
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': 'audio/mp4',
            'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(outputFilePath).pipe(res);

    } catch (error) {
        console.error('[STREAM ERROR FATAL]:', error.message || error);

        const outputFilePath = path.join(cacheDir, `${videoId}.m4a`);
        if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);

        if (!res.headersSent) res.status(500).json({ error: 'Stream error', details: error.message });
    }
});

app.get('*', (req, res) => {
    if (fs.existsSync(path.join(publicDir, 'index.html'))) {
        res.sendFile(path.join(publicDir, 'index.html'));
    } else {
        res.sendFile(path.join(distDir, 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`\n============================================`);
    console.log(`   🚀 PROXY v5.2 - ROBUST MULTI-CLIENT`);
    console.log(`   Server running on port ${PORT}`);
    console.log(`============================================\n`);
});