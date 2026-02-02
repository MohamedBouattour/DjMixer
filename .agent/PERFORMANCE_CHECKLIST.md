# 🎚️ DJ Mixer Performance Improvement Checklist

This document outlines key areas for performance optimization in the DJ Mixer application, covering audio decoding, media loading, rendering, and overall app responsiveness.

---

## 📊 Priority Legend

- 🔴 **Critical** - Must fix for production
- 🟠 **High** - Significant impact on user experience
- 🟡 **Medium** - Noticeable improvement
- 🟢 **Low** - Nice to have

---

## 1. 🎵 Audio Decoding & Processing

### 🔴 Critical

- [ ] **Use OfflineAudioContext for BPM detection**
  - Current `detectBPM()` uses the main AudioContext
  - Use `OfflineAudioContext` for non-real-time processing to avoid blocking the audio pipeline
  - Location: `src/utils/audioUtils.ts`

- [ ] **Move audio decoding to Web Worker**
  - `decodeAudioData()` can be CPU-intensive for large files
  - Offload to a dedicated Web Worker to prevent UI freezing
  - Affects: `handleImportTrack()` in `App.tsx`

### 🟠 High

- [ ] **Cache decoded AudioBuffer**
  - Store decoded `AudioBuffer` alongside track data to avoid re-decoding
  - Save serialized audio data (Float32Array) to IndexedDB

- [ ] **Implement progressive audio loading**
  - For long tracks, decode in chunks using `AudioContext.decodeAudioData()` with range requests
  - Show waveform progressively as chunks are decoded

### 🟡 Medium

- [ ] **Optimize BPM algorithm**
  - Current peak detection is O(n) over entire channel
  - Use downsampled data or analyze only first 30 seconds for faster detection
  - Consider Web Audio `AnalyserNode` for real-time BPM

- [ ] **Pre-decode tracks in library**
  - Background decode tracks in the playlist during idle time
  - Use `requestIdleCallback()` for non-blocking pre-processing

---

## 2. 📥 Media Loading & Streaming

### 🔴 Critical

- [ ] **Implement streaming download with progress**
  - Current fetch waits for entire blob before processing
  - Use `ReadableStream` to show download progress and start partial decoding
  - Location: `handleImportTrack()` in `App.tsx`

- [ ] **Add timeout and retry logic for streams**
  - Backend `/stream` endpoint can stall on slow yt-dlp downloads
  - Implement client-side timeout (e.g., 60s) with automatic retry
  - Show meaningful error messages to user

### 🟠 High

- [ ] **Implement backend download queue**
  - Multiple simultaneous `yt-dlp` calls can overload the server
  - Add queue system with max concurrent downloads (e.g., 2)
  - Location: `backend/proxy.js`

- [ ] **Add cache management**
  - Backend cache in `backend/cache/` grows indefinitely
  - Implement LRU cache with max size limit
  - Add cache cleanup on server start

- [ ] **Enable HTTP/2 or compression**
  - Large audio files benefit from gzip/brotli compression
  - Enable in Express: `app.use(compression())`

### 🟡 Medium

- [ ] **Preload next likely track**
  - Anticipate user loading the next track in playlist
  - Start streaming in background when deck approaches end (last 30s)

- [ ] **IndexedDB read/write optimization**
  - Batch operations when saving multiple tracks
  - Use `readwrite` transactions sparingly
  - Location: `src/utils/storage.ts`

---

## 3. 🖼️ Rendering & UI Performance

### 🔴 Critical

- [ ] **Debounce/throttle waveform updates**
  - Vinyl rotation animation runs on `requestAnimationFrame`
  - Ensure no unnecessary state updates during animation
  - Location: `src/components/Waveform.tsx`

- [ ] **Memoize expensive components**
  - Wrap `Deck`, `Mixer`, `Effects` with `React.memo()`
  - Add proper dependency arrays to prevent re-renders
  - Use `useMemo` for computed values

### 🟠 High

- [ ] **Optimize SVG progress ring**
  - Progress ring recalculates `strokeDasharray` on every frame
  - Use CSS custom properties and hardware-accelerated transforms
  - Location: `src/components/Waveform.tsx`

- [ ] **Use CSS containment**
  - Add `contain: layout style paint` to deck containers
  - Prevents layout thrashing from child changes
  - Location: `src/components/Deck.css`

- [ ] **Reduce DOM complexity**
  - Vinyl grooves (6 divs) could be CSS `::before`/`::after` pseudo-elements
  - Consider using Canvas for waveform visualization

### 🟡 Medium

- [ ] **Lazy load modals**
  - `SpotifyModal`, `YouTubeModal`, `SettingsModal` can be code-split
  - Use `React.lazy()` and `Suspense`
  - Only load when first opened

- [ ] **Virtualize playlist**
  - Large track libraries can slow down scrolling
  - Use virtualization (react-window or custom) for playlist
  - Location: `src/components/Playlist.tsx`

---

## 4. ⚡ State Management & Reactivity

### 🟠 High

- [ ] **Optimize keyboard event handling**
  - Current `setInterval` runs every 50ms regardless of pressed keys
  - Only run interval when keys are actually pressed
  - Location: `App.tsx` line 184-213

- [ ] **Reduce effect dependencies**
  - Large dependency arrays cause frequent effect re-runs
  - Extract stable callbacks with `useCallback`
  - Audit all `useEffect` in `App.tsx`

### 🟡 Medium

- [ ] **Debounce volume/crossfader changes**
  - Rapid slider movements cause many state updates
  - Debounce UI updates while keeping audio changes instant

- [ ] **Use refs for non-reactive state**
  - `currentTime` updates frequently but doesn't always need re-render
  - Consider storing in ref and only updating for display

---

## 5. 🔧 Backend Performance (proxy.js)

### 🔴 Critical

- [ ] **Add connection pooling**
  - Each request spawns new `yt-dlp` process
  - Consider connection reuse or process pooling

- [ ] **Implement proper error recovery**
  - If download fails mid-stream, client gets broken audio
  - Add checksum verification before serving cached files

### 🟠 High

- [ ] **Stream directly without full download**
  - Current flow: yt-dlp → full file → serve
  - Consider: yt-dlp → stream pipe → client
  - Reduces Time to First Byte (TTFB)

- [ ] **Add health check endpoint**
  - `/health` for monitoring server status
  - Include cache size, active downloads count

### 🟡 Medium

- [ ] **Optimize search results parsing**
  - Regex replacements on each result could be optimized
  - Pre-compile regex patterns

- [ ] **Add request coalescing**
  - If multiple clients request same videoId simultaneously
  - Only download once and broadcast to all waiting clients

---

## 6. 📦 Build & Bundle Optimization

### 🟠 High

- [ ] **Analyze and reduce bundle size**
  - Run `npm run build -- --analyze` or add bundle analyzer
  - Look for large dependencies (charts, UI libraries)

- [ ] **Code splitting by route/component**
  - Separate main mixer from modals
  - Lazy load effects panel on mobile

- [ ] **Tree shaking verification**
  - Ensure unused exports are removed
  - Check that `package.json` has `sideEffects: false`

### 🟡 Medium

- [ ] **Enable Vite's built-in optimizations**
  - Verify `build.minify` is set to `'esbuild'` or `'terser'`
  - Enable CSS code splitting

- [ ] **Optimize asset loading**
  - Preload critical fonts
  - Use `<link rel="preconnect">` for API server

---

## 7. 📱 Mobile-Specific Optimizations

### 🟠 High

- [ ] **Reduce animations on mobile**
  - Detect `prefers-reduced-motion`
  - Simplify vinyl rotation animation on low-power devices

- [ ] **Touch event optimization**
  - Use passive event listeners where possible
  - Reduce touch scroll jank

### 🟡 Medium

- [ ] **Responsive image sizes**
  - Serve smaller thumbnails on mobile
  - Use `srcset` for responsive images

- [ ] **Reduce memory footprint**
  - Consider unloading non-visible deck's waveform on mobile
  - Limit cached tracks in memory

---

## 8. 🧪 Performance Monitoring

### 🟠 High

- [ ] **Add performance marks**
  - Use `performance.mark()` and `performance.measure()`
  - Track: track load time, decode time, time to play

- [ ] **Implement Core Web Vitals tracking**
  - Monitor LCP, FID, CLS
  - Use `web-vitals` library

### 🟡 Medium

- [ ] **Add error boundary with reporting**
  - Catch JS errors with React Error Boundaries
  - Report to analytics service

- [ ] **Monitor memory usage**
  - Track `performance.memory` (Chrome only)
  - Alert if memory exceeds threshold

---

## 📋 Quick Win Checklist (Start Here!)

These can be implemented quickly for immediate impact:

1. [ ] Add `React.memo()` to Deck, Mixer, Effects components
2. [ ] Add `contain: layout style` CSS to deck containers  
3. [ ] Debounce the keyboard event interval (only run when keys are pressed)
4. [ ] Add compression middleware to backend: `npm install compression`
5. [ ] Move BPM detection to Web Worker
6. [ ] Add loading progress indicator during track download

---

## 📈 Measuring Success

After implementing optimizations, measure these metrics:

| Metric | Current | Target |
|--------|---------|--------|
| Track Load Time | ? | < 3s |
| Time to First Audio | ? | < 1s after load |
| BPM Detection Time | ? | < 500ms |
| UI Frame Rate | ? | 60fps constant |
| Memory Usage | ? | < 200MB |
| Bundle Size | ? | < 500KB gzipped |

---

## 🔗 Related Resources

- [Web Audio API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Vite Performance Guide](https://vite.dev/guide/performance.html)
- [IndexedDB Performance Tips](https://web.dev/articles/indexeddb-best-practices)

---

*Last Updated: 2026-02-02*
