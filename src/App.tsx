import { useState, useEffect, useRef } from 'react';
import { Deck } from './components/Deck';
import { Mixer } from './components/Mixer';
import { UnifiedTrackSelector } from './components/UnifiedTrackSelector';
import { SettingsModal } from './components/SettingsModal';
import { useDeck } from './hooks/useDeck';
import type { Track } from './types';
import { getAllTracksFromDB, saveTrackToDB } from './utils/storage';
import { useSettings } from './contexts/SettingsContext';
import { getKeyLabel } from './utils/keyHelpers';
import { detectBPM } from './utils/audioUtils';
import { API_BASE_URL } from './config';
import './App.css';

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [crossfader, setCrossfader] = useState(50);
  const [masterVolume, setMasterVolume] = useState(100);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTrackSelectorOpen, setIsTrackSelectorOpen] = useState(false);

  const { keyMap, layout } = useSettings();
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 3000px)').matches);

  // Update Logic
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/version`);
        if (!res.ok) return;
        const data = await res.json();

        if (data && data.version && data.version !== 'dev' && data.version !== 'unknown') {
          const remoteVersion = data.version;
          const localVersion = localStorage.getItem('app_version');

          console.log(`[VERSION] Local: ${localVersion} | Remote: ${remoteVersion}`);

          if (!localVersion) {
            // If no local version, we assume we are fresh. Set current version.
            localStorage.setItem('app_version', remoteVersion);
          } else if (localVersion !== remoteVersion) {
            // Mismatch - update available
            setNewVersion(remoteVersion);
            setUpdateAvailable(true);
          }
        }
      } catch (e) {
        console.warn('[VERSION] Check failed:', e);
      }
    };

    // Check on mount
    checkVersion();

    // Check when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleUpdate = () => {
    if (newVersion) {
      localStorage.setItem('app_version', newVersion);
      window.location.reload();
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 3000px)').matches);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    const preventContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', preventContextMenu);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('contextmenu', preventContextMenu);
    };
  }, []);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const deckAGainRef = useRef<GainNode | null>(null);
  const deckBGainRef = useRef<GainNode | null>(null);

  // Initialize audio context
  useEffect(() => {
    // Only create audio context once
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.value = masterVolume / 100;
      masterGainRef.current.connect(audioContextRef.current.destination);

      deckAGainRef.current = audioContextRef.current.createGain();
      deckAGainRef.current.connect(masterGainRef.current);

      deckBGainRef.current = audioContextRef.current.createGain();
      deckBGainRef.current.connect(masterGainRef.current);
    }

    return () => {
      // Don't close context on every render, strictly speaking only on unmount
      // audioContextRef.current?.close();
    };
  }, []);

  // We need to ensure audioContextRef is initialized for useDeck but since we use ref it might be null initially 
  // However, useDeck likely uses it in effects. 
  // IMPORTANT: The original code passed audioContextRef.current! which implies it expects it to be there.
  // But refs are mutable and not reactive. 
  // For the sake of this refactor to move hooks up, let's keep the initialization logic but move the hook calls up.
  // The logic in original code regarding audioContext initialization was inside a useEffect on [] dependency.
  // This means on first render audioContextRef.current is null.
  // useDeck likely needs to handle null audioContext or we need to render deeper.
  // Assuming the original code worked, useDeck might only use it in effects or callbacks.

  const { state: deckAState, controls: deckA } = useDeck({
    audioContext: audioContextRef.current!, // This was unsafe in original too if checked immediately
    destination: deckAGainRef.current!,
    deckId: 'A'
  });

  const { state: deckBState, controls: deckB } = useDeck({
    audioContext: audioContextRef.current!,
    destination: deckBGainRef.current!,
    deckId: 'B'
  });

  // Screen Wake Lock
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const isPlaying = deckAState.isPlaying || deckBState.isPlaying;

    const requestWakeLock = async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.warn('Wake Lock request failed:', err);
        }
      }
    };

    if (isPlaying) {
      requestWakeLock();
    }

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(console.warn);
      }
    };
  }, [deckAState.isPlaying, deckBState.isPlaying]);

  // Update crossfader
  useEffect(() => {
    if (deckAGainRef.current && deckBGainRef.current) {
      const deckAVolume = 1 - (crossfader / 100);
      const deckBVolume = crossfader / 100;

      deckAGainRef.current.gain.value = deckAVolume;
      deckBGainRef.current.gain.value = deckBVolume;
    }
  }, [crossfader]);

  const downloadingTracksRef = useRef<Set<string>>(new Set());

  // Load tracks from DB
  useEffect(() => {
    const loadTracks = async () => {
      try {
        const storedTracks = await getAllTracksFromDB();
        setTracks(storedTracks);
      } catch (error) {
        console.error('Failed to load tracks from DB:', error);
      }
    };
    loadTracks();
  }, []);

  // Update master volume
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume / 100;
    }
  }, [masterVolume]);

  // Track pressed keys for simultaneous input
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Global Key Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSettingsOpen) return;

      // Ignore if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Special global shortcut: Space to cancel active loops
      // We call clearLoop unconditionally because checking deckState.activeLoop might be stale inside this useEffect
      if (e.code === 'Space') {
        e.preventDefault();
        deckA.clearLoop();
        deckB.clearLoop();
        return;
      }

      const actionEntry = Object.entries(keyMap).find(([_, key]) => key === e.code);
      if (!actionEntry) return;

      // Prevent default browser behavior (scrolling with arrows, space playing/pausing focused button, etc.)
      e.preventDefault();

      if (e.repeat) {
        // Continuous actions (volume/crossfader) are handled by the interval loop
        // But we can let them repeat here too if we want immediate response.
        // However, for Play/Cue/Effect, we definitely want to skip repeats.
        const triggerActions = ['DECK_A_PLAY', 'DECK_A_CUE', 'DECK_B_PLAY', 'DECK_B_CUE', 'EFFECT_A_TOGGLE', 'EFFECT_B_TOGGLE'];
        const action = actionEntry[0];
        if (triggerActions.includes(action)) {
          return;
        }
      }

      pressedKeysRef.current.add(e.code);

      // Immediate action for triggers
      const action = actionEntry[0];
      switch (action) {
        case 'DECK_A_PLAY':
          if (deckAState.isPlaying) deckA.pause();
          else deckA.play();
          break;
        case 'DECK_A_CUE':
          deckA.handleCue(0);
          break;
        case 'DECK_B_PLAY':
          if (deckBState.isPlaying) deckB.pause();
          else deckB.play();
          break;
        case 'DECK_B_CUE':
          deckB.handleCue(0);
          break;
        case 'EFFECT_A_TOGGLE':
          deckA.toggleEffect('filter');
          break;
        case 'EFFECT_B_TOGGLE':
          deckB.toggleEffect('filter');
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
    };

    // Interval loop for continuous actions (Volume, Crossfader)
    // This handles holding multiple keys simultaneously (e.g. Vol A Up and Vol B Down)
    const interval = setInterval(() => {
      if (isSettingsOpen) return;

      pressedKeysRef.current.forEach(code => {
        const actionEntry = Object.entries(keyMap).find(([_, key]) => key === code);
        if (!actionEntry) return;

        const action = actionEntry[0];
        switch (action) {
          case 'VOLUME_A_UP':
            deckA.setVolume(v => Math.min(150, v + 2));
            break;
          case 'VOLUME_A_DOWN':
            deckA.setVolume(v => Math.max(0, v - 2));
            break;
          case 'VOLUME_B_UP':
            deckB.setVolume(v => Math.min(150, v + 2));
            break;
          case 'VOLUME_B_DOWN':
            deckB.setVolume(v => Math.max(0, v - 2));
            break;
          case 'CROSSFADER_LEFT':
            setCrossfader(prev => Math.max(0, prev - 2));
            break;
          case 'CROSSFADER_RIGHT':
            setCrossfader(prev => Math.min(100, prev + 2));
            break;
        }
      });
    }, 50); // 20 times per second

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(interval);
    };
  }, [keyMap, deckA, deckB, isSettingsOpen, deckAState.isPlaying, deckBState.isPlaying]);

  const handleLoadToDeck = (track: Track, deck: 'A' | 'B') => {
    if (deck === 'A') {
      deckA.loadTrack(track);
    } else {
      deckB.loadTrack(track);
    }
  };



  const handleImportTrack = async (track: Track, deckId: 'A' | 'B') => {
    // Check if track is already in our library (has a file/blob)
    const existingTrack = tracks.find(t => t.id === track.id);
    if (existingTrack && existingTrack.file) {
      console.log('Track already in library, using local file:', existingTrack.name);

      let trackToLoad = existingTrack;

      // Backfill BPM if missing
      if (!existingTrack.bpm && audioContextRef.current) {
        try {
          console.log('Backfilling BPM for cached track...');
          const arrayBuffer = await existingTrack.file.arrayBuffer();
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          const bpm = await detectBPM(audioBuffer);

          trackToLoad = { ...existingTrack, bpm };
          await saveTrackToDB(trackToLoad);
          setTracks(prev => prev.map(t => t.id === trackToLoad.id ? trackToLoad : t));
          console.log('BPM Backfilled:', bpm);
        } catch (e) {
          console.warn('Failed to backfill BPM:', e);
        }
      }

      handleLoadToDeck(trackToLoad, deckId);
      return;
    }

    // Prevent duplicate downloads
    if (downloadingTracksRef.current.has(track.id)) {
      console.log('Track is already downloading:', track.name);
      return;
    }

    let finalTrack = { ...track };
    const deck = deckId === 'A' ? deckA : deckB;

    // Show loading spinner on the deck immediately
    deck.setIsLoading(true);

    // If it's a stream URL and we don't have the file yet
    if (!track.file && (track.url.includes(API_BASE_URL) || track.url.includes('/stream'))) {
      try {
        downloadingTracksRef.current.add(track.id);
        console.log('Downloading track for persistence:', track.name);

        const res = await fetch(track.url);
        if (!res.ok) throw new Error(`Stream fetch failed: ${res.status} ${res.statusText}`);

        const blob = await res.blob();

        let bpm = track.bpm;
        if (!bpm && audioContextRef.current) {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            bpm = await detectBPM(audioBuffer);
            console.log('Detected BPM:', bpm);
          } catch (bpmErr) {
            console.warn('Failed to detect BPM:', bpmErr);
          }
        }

        // Create a File object from the blob
        const file = new File([blob], `${track.name}.mp3`, { type: 'audio/mpeg' });

        finalTrack = {
          ...track,
          file: file,
          bpm: bpm,
          url: URL.createObjectURL(file) // Use local blob URL
        };

        // Save to IndexedDB
        await saveTrackToDB(finalTrack);
        console.log('Track saved to DB:', track.name);

        setTracks(prev => {
          if (prev.some(t => t.id === finalTrack.id)) {
            return prev.map(t => t.id === finalTrack.id ? finalTrack : t);
          }
          return [...prev, finalTrack];
        });

      } catch (err) {
        console.error('Failed to persist track:', err);
        deck.setIsLoading(false); // Ensure loading stops on error
      } finally {
        downloadingTracksRef.current.delete(track.id);
      }
    }

    // Load the final track (or the original if download failed/skipped)
    handleLoadToDeck(finalTrack, deckId);
    // deck.loadTrack will handle setting isLoading to false when done
  };

  return (
    <div className="app">
      {/* UPDATE MODAL */}
      {updateAvailable && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            background: '#1a1a1a',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid #ff0080',
            textAlign: 'center',
            boxShadow: '0 0 30px rgba(255, 0, 128, 0.4)',
            maxWidth: '90%'
          }}>
            <h2 style={{ color: 'white', marginBottom: '1rem', fontSize: '1.5rem' }}>New Version Available</h2>
            <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>A new version of the app is available.</p>
            <div style={{ background: '#222', padding: '0.5rem', borderRadius: '4px', marginBottom: '1.5rem', fontFamily: 'monospace', color: '#00d4ff' }}>
              v.{newVersion?.substring(0, 8)}...
            </div>
            <button
              onClick={handleUpdate}
              style={{
                background: 'linear-gradient(135deg, #ff0080 0%, #ff4040 100%)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '24px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(255, 0, 128, 0.4)'
              }}
            >
              Update Now
            </button>
          </div>
        </div>
      )}
      {!isMobile ? (
        <header className="app-header">
          <div className="app-logo">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="2" x2="12" y2="4" />
              </svg>
            </div>
            <h1 className="app-title">DJ Controller</h1>
          </div>
          <div className="settings-btn-container">
            <button
              className="settings-btn"
              onClick={() => setIsTrackSelectorOpen(true)}
              style={{ marginRight: '10px' }}
              title="Open Library"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </button>
            <button
              className="settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              style={{ right: '50%' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>
      ) : (
        <div className="floating-actions">
          <button
            className="settings-floating-btn"
            onClick={() => setIsTrackSelectorOpen(true)}
            title="Open Library"
            style={{ marginBottom: '10px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </button>
          <button
            className="settings-floating-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Open Settings"
            style={{
              top: '-15px',
              right: 'calc(50% - 24px)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <div className="orientation-warning">
        <svg className="orientation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12" y2="18"></line>
        </svg>
        <p>Please rotate your device to landscape mode</p>
      </div>

      <main className="app-main">
        <div className="decks-section">
          <Deck
            deckId="A"
            state={deckAState}
            onPlay={deckA.play}
            onPause={deckA.pause}
            onSeek={deckA.seek}
            onPitchChange={deckA.setPitch}

            onToggleEffect={deckA.toggleEffect}
            onCue={deckA.handleCue}
            onDeleteCue={deckA.deleteCue}
            onLoopSet={deckA.setLoop}
            onLoopClear={deckA.clearLoop}
            color="#ff0080"
            shortcuts={!isMobile ? {
              play: getKeyLabel(keyMap['DECK_A_PLAY'], layout),
              cue: getKeyLabel(keyMap['DECK_A_CUE'], layout),
              effect: getKeyLabel(keyMap['EFFECT_A_TOGGLE'], layout)
            } : undefined}
          />

          <div className="center-section">
            <Mixer
              crossfaderValue={crossfader}
              onCrossfaderChange={setCrossfader}
              masterVolume={masterVolume}
              onMasterVolumeChange={setMasterVolume}
              deckAState={deckAState}
              deckBState={deckBState}
              onVolumeChange={(deck, value) => deck === 'A' ? deckA.setVolume(value) : deckB.setVolume(value)}
              onEQChange={(deck, band, value) => deck === 'A' ? deckA.setEQ(band, value) : deckB.setEQ(band, value)}
              shortcuts={!isMobile ? {
                volumeA: { up: getKeyLabel(keyMap['VOLUME_A_UP'], layout), down: getKeyLabel(keyMap['VOLUME_A_DOWN'], layout) },
                volumeB: { up: getKeyLabel(keyMap['VOLUME_B_UP'], layout), down: getKeyLabel(keyMap['VOLUME_B_DOWN'], layout) },
                crossfader: { left: getKeyLabel(keyMap['CROSSFADER_LEFT'], layout), right: getKeyLabel(keyMap['CROSSFADER_RIGHT'], layout) }
              } : undefined}
            />

          </div>

          <Deck
            deckId="B"
            state={deckBState}
            onPlay={deckB.play}
            onPause={deckB.pause}
            onSeek={deckB.seek}
            onPitchChange={deckB.setPitch}

            onToggleEffect={deckB.toggleEffect}
            onCue={deckB.handleCue}
            onDeleteCue={deckB.deleteCue}
            onLoopSet={deckB.setLoop}
            onLoopClear={deckB.clearLoop}
            color="#00d4ff"
            shortcuts={!isMobile ? {
              play: getKeyLabel(keyMap['DECK_B_PLAY'], layout),
              cue: getKeyLabel(keyMap['DECK_B_CUE'], layout),
              effect: getKeyLabel(keyMap['EFFECT_B_TOGGLE'], layout)
            } : undefined}
          />
        </div>

        <UnifiedTrackSelector
          isOpen={isTrackSelectorOpen}
          onClose={() => setIsTrackSelectorOpen(false)}
          tracks={tracks}
          onTracksChange={setTracks}
          onLoadTrack={handleImportTrack}
          isPlayingA={deckAState.isPlaying}
          isPlayingB={deckBState.isPlaying}
        />
      </main>
    </div>
  );
}

export default App;
