const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const yts = require('yt-search');

// ─── Config ──────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3002;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, '../dist');
const cacheDir = path.join(__dirname, 'cache');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(cors());
app.use(express.json());

// ─── Request Counter ─────────────────────────────────────────────────────────
let requestCount = 0;
let statsFile = path.join(dataDir, 'stats.json');

function loadStats() {
  try {
    if (fs.existsSync(statsFile)) {
      const d = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
      requestCount = d.count || 0;
    }
  } catch (e) {}
}

function saveStats() {
  try {
    fs.writeFileSync(statsFile, JSON.stringify({ count: requestCount }));
  } catch (e) {}
}

loadStats();

function incrementRequests(n = 1) {
  requestCount += n;
  saveStats();
}

// ─── Static Files ────────────────────────────────────────────────────────────
let staticDir = null;
if (fs.existsSync(publicPath)) {
  staticDir = publicPath;
} else if (fs.existsSync(distPath)) {
  staticDir = distPath;
}
if (staticDir) app.use(express.static(staticDir));

// ─── Helper: parse track metadata from YouTube titles ───────────────────────
function parseTrackMetadata(videoTitle, channelName) {
  if (!videoTitle) return { artist: 'Unknown Artist', title: 'Unknown Title' };
  let clean = videoTitle
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\[\s*(official\s+video|official\s+audio|lyric\s+video|lyrics|official|audio|video|hd|hq|1080p|4k|visualizer)\s*\]/gi, '')
    .replace(/\(\s*(official\s+video|official\s+audio|lyric\s+video|lyrics|official|audio|video|hd|hq|1080p|4k|visualizer)\s*\)/gi, '')
    .trim();
  const separators = [' - ', ' – ', ' — ', ' | ', ' : ', ' / '];
  let leftmostSep = null, leftmostIdx = Infinity;
  for (const sep of separators) {
    const idx = clean.indexOf(sep);
    if (idx !== -1 && idx < leftmostIdx) { leftmostIdx = idx; leftmostSep = sep; }
  }
  let artist = '', songTitle = '';
  if (leftmostSep) {
    const parts = clean.split(leftmostSep);
    artist = parts[0].trim();
    songTitle = parts.slice(1).join(leftmostSep).trim();
  } else {
    const match = clean.match(/^([^-]+)-+(.+)$/);
    if (match) { artist = match[1].trim(); songTitle = match[2].trim(); }
  }
  if (!artist || !songTitle || artist.length > 50) {
    if (channelName) { artist = channelName; songTitle = clean; }
    else { artist = 'Unknown Artist'; songTitle = clean; }
  }
  artist = artist.replace(/^["'«\s]+|["'»\s]+$/g, '').trim();
  songTitle = songTitle.replace(/^["'«\s]+|["'»\s]+$/g, '').trim();
  return { artist, title: songTitle };
}

// ─── Helper: Search YouTube ──────────────────────────────────────────────────
async function searchYouTube(query, maxResults = 15) {
  const r = await yts(query);
  return (r.videos || []).slice(0, maxResults).map(v => {
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
}

// ─── API: Stats ──────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  res.json({ requests: requestCount });
});

// ─── API: Search (YouTube) ───────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });
    incrementRequests();
    const results = await searchYouTube(query);
    res.json(results);
  } catch (error) {
    console.error('[SEARCH]', error.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── API: Recommendations (YouTube search) ────────────────────────────────────
app.get('/api/recommend', async (req, res) => {
  try {
    const { q, genre } = req.query;
    let searchTerm = q ? String(q) : '';
    if (!searchTerm) {
      const genres = ['house', 'techno', 'edm', 'dance', 'electronic', 'hip hop', 'pop', 'rock', 'rnb', 'latin'];
      const pick = genre || genres[Math.floor(Math.random() * genres.length)];
      searchTerm = `${pick} hits`;
    }
    incrementRequests();
    const results = await searchYouTube(`${searchTerm} music`, 8);
    res.json({ recommendations: results, source: 'youtube' });
  } catch (error) {
    console.error('[RECOMMEND]', error.message);
    res.status(500).json({ error: 'Recommendation failed' });
  }
});

// ─── Helper: Fetch from RapidAPI YouTube-to-MP3 ────────────────────────────
const RAPID_API_KEY = process.env.RAPID_API_KEY;
const RAPID_API_HOST = process.env.RAPID_API_HOST;

async function fetchRapidAudio(videoId) {
  const url = `https://${RAPID_API_HOST}/dl?id=${videoId}`;
  const options = {
    headers: {
      'x-rapidapi-key': RAPID_API_KEY,
      'x-rapidapi-host': RAPID_API_HOST
    }
  };
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`RapidAPI HTTP ${response.status}`);
    const data = await response.json();
    if (data.status === 'ok' && data.link) return data.link;
    if (data.status === 'processing') {
      attempts++;
      await new Promise(r => setTimeout(r, 1500));
    } else {
      throw new Error(data.msg || 'RapidAPI conversion failed');
    }
  }
  throw new Error('RapidAPI timeout');
}

// ─── API: Stream (audio proxy) ───────────────────────────────────────────────
app.get('/api/stream', async (req, res) => {
  try {
    let videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });
    incrementRequests();

    const cacheFilePath = path.join(cacheDir, `${videoId}.mp3`);

    // Serve from cache if available
    if (fs.existsSync(cacheFilePath) && fs.statSync(cacheFilePath).size > 0) {
      const stat = fs.statSync(cacheFilePath);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': stat.size });
      fs.createReadStream(cacheFilePath).pipe(res);
      return;
    }

    // Fetch via RapidAPI and cache
    if (!RAPID_API_KEY || !RAPID_API_HOST) {
      return res.status(500).json({ error: 'RAPID_API_KEY or RAPID_API_HOST not configured' });
    }

    const downloadUrl = await fetchRapidAudio(videoId);
    const audioRes = await fetch(downloadUrl);
    if (!audioRes.ok || !audioRes.body) {
      return res.status(502).json({ error: 'Failed to download audio from RapidAPI' });
    }

    const writeStream = fs.createWriteStream(cacheFilePath);
    await new Promise((resolve, reject) => {
      Readable.fromWeb(audioRes.body).pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stat = fs.statSync(cacheFilePath);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': stat.size });
    fs.createReadStream(cacheFilePath).pipe(res);
  } catch (error) {
    console.error('[STREAM]', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
  }
});

// ─── API: Version ────────────────────────────────────────────────────────────
app.get('/api/version', (req, res) => {
  try {
    if (!staticDir) return res.json({ version: 'api-only' });
    const assetsDir = path.join(staticDir, 'assets');
    if (!fs.existsSync(assetsDir)) return res.json({ version: 'dev' });
    const files = fs.readdirSync(assetsDir);
    const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    if (indexJs) res.json({ version: indexJs.substring(6, indexJs.length - 3), filename: indexJs });
    else res.json({ version: 'unknown', filename: null });
  } catch (error) {
    res.status(500).json({ error: 'Version check failed' });
  }
});

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (staticDir) {
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  }
  res.status(404).send('App not ready. Run build first.');
});

app.listen(PORT, () => {
  console.log(`\n  DJ Mixer API running on port ${PORT}`);
  console.log(`  Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`  Static: ${staticDir || 'none'}\n`);
});
