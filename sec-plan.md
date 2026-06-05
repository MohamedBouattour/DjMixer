# DJ Pro Master — Restructuring Plan

> Full audit of SEO, Performance, and Security. Prioritized by impact.

---

## Current State Summary

| Area | Rating | Key Issues |
|------|--------|------------|
| **Security** | 🔴 Critical | Hardcoded secrets, no rate limiting, self-signed SSL, open CORS, no auth middleware on API routes, JWT secret fallback in code |
| **Performance** | 🟡 Moderate | 564-line monolith `App.tsx`, no code splitting, no lazy loading, no image optimization, Google Fonts render-blocking |
| **SEO** | 🟡 Moderate | Minimal meta tags, no Open Graph / Twitter cards, no `robots.txt`, no sitemap, no structured data, SPA with no SSR |
| **Architecture** | 🟡 Moderate | Flat component structure, 609-line monolith backend, no route separation, mixed concerns |

---

## Phase 1 — Project Structure & Architecture

> Goal: Clean separation of concerns, smaller files, maintainability.

### 1.1 — Break Up `App.tsx` (564 lines → ~150 each)

Currently everything lives in one giant file: audio init, crossfader logic, track management, keyboard shortcuts, and the full render tree.

```
src/
├── App.tsx                    # ~80 lines — layout shell only
├── app.css
├── main.tsx
├── config.ts
├── components/
│   ├── layout/
│   │   ├── Header.tsx         # Extract from App.tsx L384-L436
│   │   ├── AudioUnlockOverlay.tsx  # Extract from App.tsx L438-L465
│   │   ├── OrientationWarning.tsx  # Extract from App.tsx L373-L382
│   │   └── FloatingActions.tsx     # Extract from App.tsx L467-L488
│   ├── deck/
│   │   ├── Deck.tsx           # (existing)
│   │   ├── Waveform.tsx       # (existing)
│   │   ├── ScrollableWaveform.tsx
│   │   └── WaveformBar.tsx
│   ├── mixer/
│   │   ├── Mixer.tsx          # (existing)
│   │   ├── HorizontalSlider.tsx
│   │   ├── VerticalSlider.tsx
│   │   └── TimeDisplay.tsx
│   ├── library/
│   │   └── UnifiedTrackSelector.tsx
│   ├── settings/
│   │   └── SettingsModal.tsx
│   └── auth/
│       ├── AuthModal.tsx
│       └── InstallPWA.tsx
├── hooks/
│   ├── useDeck.ts             # (existing)
│   ├── useAudioContext.ts     # Extract global AudioContext init + worklets
│   ├── useKeyboardShortcuts.ts # Extract L342-L369
│   ├── useTrackManager.ts     # Extract L221-L329 (load/save/sync/delete)
│   └── useWakeLock.ts         # Extract L188-L211
├── contexts/
│   ├── AuthContext.tsx         # (existing)
│   └── SettingsContext.tsx     # (existing)
├── types/
│   └── index.ts               # (existing)
├── utils/
│   ├── audioUtils.ts
│   ├── cn.ts
│   ├── helpers.ts
│   ├── keyHelpers.ts
│   ├── sharedStyles.ts
│   └── storage.ts
└── services/
    └── api.ts                 # Centralize all fetch() calls currently scattered
```

### 1.2 — Break Up Backend `proxy.js` (609 lines → Route Modules)

```
backend/
├── server.js                  # Express app setup, middleware, listen (~50 lines)
├── db.js                      # SQLite setup, migrations, prepared statements
├── middleware/
│   ├── auth.js                # JWT verification middleware
│   ├── rateLimiter.js         # Rate limiting per route
│   └── security.js            # Helmet, CORS config, input sanitization
├── routes/
│   ├── auth.js                # /api/auth/* (register, login, google)
│   ├── search.js              # /api/search
│   ├── stream.js              # /api/stream (YouTube + Skysound proxy)
│   ├── tracks.js              # /api/users/:uid/tracks
│   └── version.js             # /api/version
├── services/
│   ├── rapidApi.js            # RapidAPI fetch logic
│   ├── skysound.js            # Skysound scraping logic
│   └── youtube.js             # yt-dlp download logic
├── .env
└── package.json
```

---

## Phase 2 — Security Hardening 🔴

> **Priority: CRITICAL** — These must be fixed before anything else.

### 2.1 — Remove All Hardcoded Secrets

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `backend/proxy.js` | L23 | Google Client ID hardcoded as fallback | Remove fallback, fail if env missing |
| `backend/proxy.js` | L25 | JWT secret has insecure fallback `'djmixer-secret-change-in-prod'` | Remove fallback, require `JWT_SECRET` env var |
| `vite.config.ts` | L41-58 | VPS IP `79.137.14.75` hardcoded 4 times | Move to `.env` as `VITE_API_TARGET` |
| `src/config.ts` | L3 | VPS IP hardcoded in API_BASE_URL fallback | Use env var only, fail gracefully |
| `deploy.js` | L9 | VPS IP hardcoded | Read from env |

### 2.2 — Add Authentication Middleware

Currently **all user-track endpoints are unprotected** — anyone can read/write any user's tracks by guessing their UUID.

```js
// NEW: backend/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        // Verify the user is accessing their own resources
        if (req.params.uid && req.params.uid !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
```

Apply to routes:
- `GET /api/users/:uid/tracks` → **requires auth + ownership check**
- `POST /api/users/:uid/tracks` → **requires auth + ownership check**
- `DELETE /api/users/:uid/tracks/:trackId` → **requires auth + ownership check**

### 2.3 — Replace Self-Signed SSL with Let's Encrypt

Current `djmixer.conf` uses self-signed certs → browser warnings, no trust.

```bash
# Install certbot on VPS
apt install certbot python3-certbot-nginx

# Requires a real domain (not bare IP)
# Option 1: Buy a domain and point A record to 79.137.14.75
# Option 2: Use a free subdomain (duckdns.org, freedns.afraid.org)

certbot --nginx -d yourdomain.com
```

Update `djmixer.conf`:
```nginx
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

### 2.4 — Lock Down CORS

Current: `app.use(cors())` → **allows any origin**.

```js
// Fix:
app.use(cors({
    origin: [
        'https://yourdomain.com',
        process.env.NODE_ENV !== 'production' && 'http://localhost:5173'
    ].filter(Boolean),
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true
}));
```

### 2.5 — Add Rate Limiting

Zero rate limiting means abuse vectors on:
- `/api/auth/register` → brute-force account creation
- `/api/auth/login` → credential stuffing
- `/api/search` → API quota burn
- `/api/stream` → bandwidth abuse

```bash
npm install express-rate-limit
```

```js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const searchLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 30 });
const streamLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 15 });

app.use('/api/auth', authLimiter);
app.use('/api/search', searchLimiter);
app.use('/api/stream', streamLimiter);
```

### 2.6 — Add Helmet Security Headers

```bash
npm install helmet
```

```js
const helmet = require('helmet');
app.use(helmet());
```

This auto-adds: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`, CSP, and more.

### 2.7 — Input Validation & Sanitization

Current issues:
- `/api/search?q=` — no length limit, no sanitization
- `/api/stream?videoId=` — no format validation (accepts anything)
- Auth routes — no email format validation, no password strength check

```js
// Validate videoId format (YouTube = 11 chars alphanumeric, Skysound = base64)
const isValidVideoId = (id) => /^[a-zA-Z0-9_-]{11}$/.test(id) || /^[A-Za-z0-9+/=]+$/.test(id);

// Validate search query
const isValidQuery = (q) => typeof q === 'string' && q.length > 0 && q.length <= 200;

// Validate email
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
```

### 2.8 — Fix `StrictHostKeyChecking=no` in Deploy Script

`deploy.js` L28-30 disables SSH host key verification → vulnerable to MITM.

```diff
-scp -i "${VPS_KEY}" -o StrictHostKeyChecking=no
+scp -i "${VPS_KEY}" -o StrictHostKeyChecking=accept-new
```

First deploy adds the key to `known_hosts`; subsequent deploys verify it.

---

## Phase 3 — Performance Optimization 🟡

### 3.1 — Code Splitting & Lazy Loading

Heavy components loaded eagerly even if never used:

```tsx
// App.tsx — lazy load modals and heavy components
const SettingsModal = React.lazy(() => import('./components/settings/SettingsModal'));
const AuthModal = React.lazy(() => import('./components/auth/AuthModal'));
const UnifiedTrackSelector = React.lazy(() => import('./components/library/UnifiedTrackSelector'));

// Wrap in Suspense
<Suspense fallback={null}>
    {isSettingsOpen && <SettingsModal ... />}
</Suspense>
```

### 3.2 — Optimize Google Fonts Loading

Current: render-blocking `<link>` tags in `<head>`.

```html
<!-- Replace current approach with font-display swap + preload -->
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
</noscript>
```

Or better: **self-host the font** to eliminate the external dependency:
```bash
# Download Inter font files and add to public/fonts/
# Reference in app.css with @font-face
```

### 3.3 — Image Optimization

- `app-icon.jpg` is **451 KB** → Should be < 50 KB
- PWA manifest references `pwa-192x192.png` and `pwa-512x512.png` that **don't exist**
- No `favicon.ico` exists (referenced in `vite.config.ts` L13)

```bash
# Generate optimized PWA icons from app-icon.jpg
# Use sharp or squoosh to compress
npx sharp-cli -i public/app-icon.jpg -o public/app-icon.webp --quality 80
# Generate proper PWA icon sizes
```

### 3.4 — Vite Build Optimization

```ts
// vite.config.ts — add chunk splitting
build: {
    rollupOptions: {
        output: {
            manualChunks: {
                'vendor-react': ['react', 'react-dom'],
                'vendor-wavesurfer': ['wavesurfer.js'],
                'vendor-audio': ['music-tempo'],
            }
        }
    },
    // Enable compression
    minify: 'terser',
    terserOptions: {
        compress: { drop_console: true, drop_debugger: true }
    }
}
```

### 3.5 — Backend Caching

- `/api/search` results → cache for 5 min (same query = same results)
- `/api/version` → cache for 60 seconds
- Static assets in Nginx → add `Cache-Control` headers

```nginx
# djmixer.conf — add caching for static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 3.6 — AudioContext Optimization

Current: eagerly creates `AudioContext` + 3 gain nodes at module scope (L17-42) — even before user interacts. This causes Chrome console warnings.

```ts
// Fix: defer creation until first user gesture
let globalAudioContext: AudioContext | null = null;

const getAudioContext = () => {
    if (!globalAudioContext) {
        globalAudioContext = new AudioContext();
    }
    return globalAudioContext;
};
```

### 3.7 — Remove Unused Dependencies

Check if these are actually used in the bundle:
- `clsx` + `tailwind-merge` — verify usage vs just using Tailwind directly
- `@react-oauth/google` — check if used or if custom OAuth flow replaced it

---

## Phase 4 — SEO Improvements 🟡

### 4.1 — Enhanced Meta Tags

```html
<!-- index.html -->
<head>
    <!-- Primary -->
    <title>DJ Pro Master — Professional DJ Controller Web App</title>
    <meta name="description" content="Mix tracks like a pro with DJ Pro Master. Dual-deck controller with effects, BPM sync, and crossfading. Works in your browser — no install needed.">

    <!-- Open Graph (Facebook, Discord, LinkedIn) -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="DJ Pro Master — Browser DJ Controller">
    <meta property="og:description" content="Professional dual-deck DJ mixing in your browser. EQ, effects, crossfade, and BPM sync.">
    <meta property="og:image" content="https://yourdomain.com/og-image.png">
    <meta property="og:url" content="https://yourdomain.com">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="DJ Pro Master">
    <meta name="twitter:description" content="Mix music in your browser with professional DJ tools">
    <meta name="twitter:image" content="https://yourdomain.com/og-image.png">

    <!-- Additional -->
    <meta name="application-name" content="DJ Pro Master">
    <meta name="keywords" content="DJ, mixer, music, beats, controller, web app, online DJ, crossfader">
    <link rel="canonical" href="https://yourdomain.com">
</head>
```

### 4.2 — Create `robots.txt`

```
# public/robots.txt
User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://yourdomain.com/sitemap.xml
```

### 4.3 — Create `sitemap.xml`

```xml
<!-- public/sitemap.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://yourdomain.com/</loc>
        <lastmod>2026-06-05</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>
```

### 4.4 — Structured Data (JSON-LD)

```html
<script type="application/ld+json">
{
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "DJ Pro Master",
    "description": "Professional DJ controller web app with dual decks, effects, and mixing tools",
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "Any",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "browserRequirements": "Requires JavaScript, Web Audio API"
}
</script>
```

### 4.5 — Fix PWA Manifest Completeness

Current manifest is missing critical fields:

```jsonc
{
    "name": "DJ Pro Master",
    "short_name": "DJ Mix",
    "description": "Professional DJ controller with dual decks, effects, and mixing tools",
    "start_url": "/",
    "id": "/",
    "display": "standalone",
    "orientation": "landscape",
    "background_color": "#0a0a0a",
    "theme_color": "#0a0a0a",
    "categories": ["music", "entertainment"],
    "lang": "en",
    "dir": "ltr",
    "icons": [
        { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
        { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
    ],
    "screenshots": [
        { "src": "/screenshots/desktop.png", "sizes": "1920x1080", "type": "image/png", "form_factor": "wide" },
        { "src": "/screenshots/mobile.png", "sizes": "750x1334", "type": "image/png", "form_factor": "narrow" }
    ]
}
```

---

## Phase 5 — Deployment & Infrastructure

### 5.1 — Get a Real Domain

Self-signed SSL on a bare IP is the root cause of multiple issues:
- Browser security warnings
- Can't get Let's Encrypt cert
- SEO penalty (Google flags HTTP and self-signed)
- PWA install blocked on some browsers

**Action:** Register a domain (e.g., `djpro.app`) → Point DNS A record to `79.137.14.75`.

### 5.2 — Environment Variable Audit

Create a `.env.example` (committed) documenting all required vars:

```env
# .env.example — DO NOT put real values here
NODE_ENV=production
PORT=3002
JWT_SECRET=                     # Required — generate with: openssl rand -hex 32
VITE_GOOGLE_CLIENT_ID=          # Google OAuth Client ID
RAPID_API_KEY=                  # RapidAPI key for YouTube MP3
RAPID_API_HOST=                 # RapidAPI host
VITE_API_URL=                   # Frontend API base URL (e.g., https://yourdomain.com/api)
VPS_HOST=                       # VPS IP for deploy script
VPS_KEY_PATH=                   # Path to SSH key
```

### 5.3 — Harden Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # Let's Encrypt (replaces self-signed)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Modern SSL config
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS (1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://www.googleapis.com https://accounts.google.com;" always;

    # Additional security
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(self), geolocation=()" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    gzip_min_length 1000;

    # Rate limiting zone
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3002;
        # ... existing proxy headers
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|webp|svg|woff2|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5.4 — Close Unnecessary Ports

Current deploy script opens 22, 80, 443 via UFW — this is correct. But verify:

```bash
# On VPS, audit listening ports
ss -tlnp

# Ensure port 3002 is NOT accessible externally (backend should only be reachable via Nginx)
ufw deny 3002
```

---

## Phase 6 — Testing & Monitoring

### 6.1 — Add Error Boundary

No error boundaries exist — any component crash kills the entire app.

```tsx
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return <div>Something went wrong. Please refresh.</div>;
        }
        return this.props.children;
    }
}
```

### 6.2 — Backend Health Check

```js
// GET /api/health
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage().heapUsed,
        db: db ? 'connected' : 'disconnected'
    });
});
```

### 6.3 — PM2 Monitoring

```bash
# On VPS — enable log rotation and monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Implementation Priority

| # | Task | Impact | Effort | Phase |
|---|------|--------|--------|-------|
| 1 | Remove hardcoded secrets | 🔴 Critical | ⚡ Low | 2.1 |
| 2 | Add auth middleware to user routes | 🔴 Critical | ⚡ Low | 2.2 |
| 3 | Add rate limiting | 🔴 High | ⚡ Low | 2.5 |
| 4 | Lock down CORS | 🔴 High | ⚡ Low | 2.4 |
| 5 | Add Helmet | 🟠 High | ⚡ Low | 2.6 |
| 6 | Input validation | 🟠 High | 🔧 Medium | 2.7 |
| 7 | Get real domain + Let's Encrypt | 🟠 High | 🔧 Medium | 5.1, 2.3 |
| 8 | Close port 3002 externally | 🟠 High | ⚡ Low | 5.4 |
| 9 | Break up App.tsx | 🟡 Medium | 🔧 Medium | 1.1 |
| 10 | Break up proxy.js | 🟡 Medium | 🔧 Medium | 1.2 |
| 11 | Lazy load modals | 🟡 Medium | ⚡ Low | 3.1 |
| 12 | Optimize images + fix PWA icons | 🟡 Medium | ⚡ Low | 3.3 |
| 13 | Add SEO meta tags + OG | 🟡 Medium | ⚡ Low | 4.1 |
| 14 | Add robots.txt + sitemap | 🟢 Low | ⚡ Low | 4.2-4.3 |
| 15 | Self-host fonts | 🟢 Low | ⚡ Low | 3.2 |
| 16 | Vite chunk splitting | 🟢 Low | ⚡ Low | 3.4 |
| 17 | Nginx caching headers | 🟢 Low | ⚡ Low | 5.3 |
| 18 | Error boundary | 🟢 Low | ⚡ Low | 6.1 |
| 19 | Health check endpoint | 🟢 Low | ⚡ Low | 6.2 |
| 20 | Env var audit + .env.example | 🟢 Low | ⚡ Low | 5.2 |

---

## Quick Wins (can do right now, < 5 min each)

1. **Create `.env.example`** — document all vars
2. **Add `robots.txt`** — one file, instant SEO
3. **Add `helmet`** — one `npm install` + one line
4. **Add rate limiter** — one `npm install` + 5 lines
5. **Remove JWT fallback secret** — delete one string literal
6. **Close port 3002** — one `ufw deny 3002` command
