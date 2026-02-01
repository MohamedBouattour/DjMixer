# Project Roadmap: DJ Controller Web App

## 🟢 Current Status
- **Core functionality**: Double deck mixer, responsive UI, Audio playback with effects (Reverb, Delay, Filters).
- **Integration**: YouTube Audio streaming (via backend proxy with yt-dlp), Spotify Search (UI implemented, metadata fetching).
- **UI/UX**: 
  - Glassmorphism design system.
  - **Tablet Mode**: Optimized layout, vertical headers, compact modals (Spotify/YouTube).
  - **PWA**: Installable with custom icon (`dj-icon.svg`), service worker for offline capability (partial).
- **Backend**: Node.js/Express proxy for handling media streams and avoiding CORS.

## 🟡 Work in Progress / Recent Updates
- **Spotify Modal**: 
  - Refined for tablet landscape mode (compact search, hidden footer).
  - Fixed double scrollbar issues.
  - "Add to Deck" functionality needs final verification of flow.
- **Mixer Controls**:
  - Implemented vertical volume sliders with colored fill.
  - Refined EQ controls (popup and inline).

## 🔵 Upcoming Features / To-Do
### 1. Stability & Performance
- [ ] Optimize `yt-dlp` stream loading speed.
- [ ] Better error handling for stream 403/expiration errors.
- [ ] Cache frequently used tracks locally (IndexedDB/FileSystem API).

### 2. Features
- [ ] **Automix**: Basic beat matching and crossfading automation.
- [ ] **Playlist Management**: Save local playlists, import M3U.
- [ ] **Settings Modal**: Configure audio latency, quality, backend URL.
- [ ] **Visualizer**: Audio spectrum analyzer (started but needs refinement).

### 3. Spotify/YouTube Integration
- [ ] Implement "Add to Deck" logic fully (download/stream flow).
- [ ] Enhance search results (duration, BPM detection if possible).

## 🔴 Known Issues
- `yt-dlp` streams may expire or return 403 after some time (needs refresh logic).
- Mobile layout (phone portrait) needs further optimization (currently focused on Tablet/Desktop).
