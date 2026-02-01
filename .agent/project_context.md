# Project Context: DJ Mixer Web App

## Overview
This is a comprehensive DJ Controller application that runs as:
1.  A **Progressive Web App (PWA)** optimized for Chrome/Edge.
2.  A **Desktop Application** via Electron.
It features a dual-deck interface, audio effects, and integration with YouTube (audio streaming) and Spotify (metadata search).

## Architecture
The project leverages a hybrid architecture.

### Frontend (`/src`)
- **Core**: React with TypeScript (Vite).
- **Design**: Glassmorphism UI, strictly responsive (Desktop & Tablet).
- **Audio Engine**: Web Audio API + `wavesurfer.js`.
- **State**: React Context (`AudioContext`, `DeckContext`) + Local State.

### Backend (`/backend`)
- **Role**: Intermediate Proxy Server.
- **Why**: YouTube streams cannot be played directly in the browser due to CORS and `yt-dlp` requirement.
- **Runtime**: Node.js (Express).
- **Key Function**: Resolves YouTube URLs to playable audio streams and pipes them or redirects (depending on implementation).

### Electron (`/electron`)
- **Role**: Desktop wrapper.
- **Entry Point**: `electron/main.cjs`.
- **capabilities**: Provides a native app experience, handles window management, can potentially bypass some browser restrictions (though currently relies on the same backend logic).

## Key Components
- **Deck**: The core player component. Handles loading, playing, pausing, and seeking tracks.
- **Mixer**: Central control unit for EQ (High/Mid/Low), Gain, and Crossfader.
- **SpotifyModal**: Interface to search tracks (mocked or real API) and import them to decks.
- **Visualizer**: Real-time audio visualization using Canvas/Web Audio API.

## Data Flow
1. **Search**: User searches via Spotify Modal.
2. **Select**: User loads a track to a Deck.
3. **Resolve**: Application requests audio stream via Backend Proxy (`http://localhost:3000/stream?url=...`).
4. **Proxy**: Backend runs `yt-dlp` to get the direct stream URL.
5. **Stream**: Audio is streamed to the Frontend's AudioContext.
6. **Process**: Audio passes through Gain -> EQ -> Highpass/Lowpass Filters -> Master Output.
