# Technology Stack

## Frontend (Web & Electron Renderer)
- **Language**: TypeScript
- **Framework**: React 19 (Vite 7)
- **Styling**: Vanilla CSS, CSS Variables for theming (Glassmorphism), Flexbox/Grid
- **Icons**: `lucide-react`
- **Audio**: Web Audio API (native), `wavesurfer.js` (playing & visualization), `music-tempo` (BPM detection).
- **PWA**: `vite-plugin-pwa` (Service Workers, Manifest).

## Desktop App (Electron)
- **Framework**: Electron 40
- **Builder**: `electron-builder`
- **Integration**: Wraps the web app, may have main-process specific features (shortcuts, native menus).

## Backend (Proxy Server)
- **Runtime**: Node.js
- **Server**: Express.js
- **Tools**: 
  - `youtube-dl-exec`: Wrapper for `yt-dlp` to extract audio streams.
  - `yt-search`: For searching YouTube programmatically.
  - `cors`: Handling Cross-Origin requests.

## Development Tools
- **Package Manager**: npm
- **Build Tool**: Vite, Electron Builder.
- **Linting/Formatting**: ESLint 9.

## External Services
- **YouTube**: Audio source (via `yt-dlp`).
- **Spotify**: Metadata and search source.
