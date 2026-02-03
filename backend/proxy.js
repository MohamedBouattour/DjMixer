const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Serve static files from the frontend dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Helper for decoding HTML entities if needed (basic ones)
function decodeHTMLEntities(text) {
    if (!text) return "";
    return text.replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: 'Query required' });

        console.log(`[SEARCH] Query: "${query}"`);

        const searchApiUrl = `https://skysound7.com/api/search?query=${encodeURIComponent(query)}`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        const pageResponse = await fetch(searchApiUrl, { headers, redirect: 'follow' });

        if (!pageResponse.ok) {
            console.error(`[SEARCH] Failed to fetch page: ${pageResponse.status}`);
            return res.status(500).json({ error: 'Search failed upstream' });
        }

        const html = await pageResponse.text();
        const results = [];

        // Regex to match list items. 
        // Note: HTML might have newlines. [\s\S]*? matches across lines.
        const regex = /<li class="__adv_list_track[\s\S]*?<\/li>/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const itemHtml = match[0];

            // Extract Stream URL
            const urlMatch = itemHtml.match(/data-url="([^"]+)"/);
            if (!urlMatch) continue;
            const streamUrl = urlMatch[1]; // Typically https://fine.sunproxy.net/file/...

            // Extract Title
            // Matches: span class="...__adv_name"><em>Title</em></span> OR plain text
            let title = "Unknown Title";
            const titleMatch = itemHtml.match(/class="[^"]*__adv_name">.*?<em>([^<]+)<\/em>/) ||
                itemHtml.match(/class="[^"]*__adv_name">([^<]+)</);
            if (titleMatch) title = decodeHTMLEntities(titleMatch[1]);

            // Extract Artist
            let artist = "Unknown Artist";
            const artistMatch = itemHtml.match(/class="[^"]*__adv_artist">([^<]+)<\/a>/);
            if (artistMatch) artist = decodeHTMLEntities(artistMatch[1]);

            // Extract Duration
            let duration = 0;
            const durationMatch = itemHtml.match(/class="[^"]*__adv_duration">(\d+):(\d+)</);
            if (durationMatch) {
                duration = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
            }

            // Create a safe ID from the streamUrl (Base64)
            const id = Buffer.from(streamUrl).toString('base64');

            results.push({
                id: id,
                title: title,
                artist: artist,
                duration: duration,
                thumbnail: 'https://skysound7.com/i/img/he-logo.png', // Placeholder
                streamUrl: streamUrl // Include for debugging or direct usage
            });
        }

        console.log(`[SEARCH] Found ${results.length} tracks`);
        res.json(results);

    } catch (error) {
        console.error('[SEARCH] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/stream', async (req, res) => {
    try {
        let videoId = req.query.videoId;
        if (!videoId) return res.status(400).json({ error: 'videoId required' });

        // Decode ID to get Target URL
        let targetUrl;
        try {
            targetUrl = Buffer.from(videoId, 'base64').toString('utf-8');
            if (!targetUrl.startsWith('http')) {
                // Not a simplified Base64 url? Maybe it's a real ID from old cache. 
                // We don't support old IDs anymore.
                throw new Error("Invalid ID format");
            }
        } catch (e) {
            console.error("[STREAM] Failed to decode ID:", e.message);
            return res.status(400).json({ error: 'Invalid videoId' });
        }

        console.log(`[STREAM] Proxying: ${targetUrl}`);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        // Forward Range header if present (crucial for seeking)
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const upstreamRes = await fetch(targetUrl, { headers });

        // Forward headers
        res.status(upstreamRes.status);
        res.setHeader('Content-Type', upstreamRes.headers.get('Content-Type') || 'audio/mpeg');
        res.setHeader('Content-Length', upstreamRes.headers.get('Content-Length'));
        res.setHeader('Accept-Ranges', 'bytes');
        if (upstreamRes.headers.has('Content-Range')) {
            res.setHeader('Content-Range', upstreamRes.headers.get('Content-Range'));
        }

        // Pipe content
        if (upstreamRes.body) {
            Readable.fromWeb(upstreamRes.body).pipe(res);
        } else {
            res.end();
        }

    } catch (error) {
        console.error('[STREAM] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Stream failed' });
        }
    }
});

// Handle client-side routing by serving index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n============================================`);
    console.log(`   🚀 SKYSOUND7 PROXY - LIGHTWEIGHT`);
    console.log(`   Server running on port ${PORT}`);
    console.log(`============================================\n`);
});