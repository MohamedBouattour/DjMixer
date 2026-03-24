import { useState, useEffect, useRef } from "react";
import { Deck } from "./components/Deck";
import { Mixer } from "./components/Mixer";
import { UnifiedTrackSelector } from "./components/UnifiedTrackSelector";
import { SettingsModal } from "./components/SettingsModal";
import { InstallPWA } from "./components/InstallPWA";
import { useDeck } from "./hooks/useDeck";
import type { Track } from "./types";
import { getAllTracksFromDB, saveTrackToDB } from "./utils/storage";
import { useSettings } from "./contexts/SettingsContext";
import { getKeyLabel } from "./utils/keyHelpers";
import { API_ENDPOINTS } from "./config";

// ✅ Bug A Fix: Global persistent AudioContext initialized eagerly
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const globalAudioContext = new AudioContextClass();

// Initialize shared nodes outside component for stability
const masterGain = globalAudioContext.createGain();
masterGain.connect(globalAudioContext.destination);

const deckAGain = globalAudioContext.createGain();
deckAGain.connect(masterGain);

const deckBGain = globalAudioContext.createGain();
deckBGain.connect(masterGain);

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [crossfader, setCrossfader] = useState(50);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTrackSelectorOpen, setIsTrackSelectorOpen] = useState(false);

  const { keyMap, layout } = useSettings();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);

  // Update Logic
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.VERSION);
        if (!res.ok) return;
        const data = await res.json();

        if (
          data &&
          data.version &&
          data.version !== "dev" &&
          data.version !== "unknown"
        ) {
          const remoteVersion = data.version;
          const localVersion = localStorage.getItem("app_version");

          if (!localVersion) {
            localStorage.setItem("app_version", remoteVersion);
          } else if (localVersion !== remoteVersion) {
            setNewVersion(remoteVersion);
            setUpdateAvailable(true);
          }
        }
      } catch (e) {
        console.warn("[VERSION] Check failed:", e);
      }
    };

    checkVersion();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const handleUpdate = () => {
    if (newVersion) {
      localStorage.setItem("app_version", newVersion);
      window.location.reload();
    }
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", checkMobile);
    const preventContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);
    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("contextmenu", preventContextMenu);
    };
  }, []);

  const [audioContextState, setAudioContextState] = useState<AudioContextState | "uninitialized">(
    globalAudioContext.state === 'suspended' ? 'uninitialized' : globalAudioContext.state
  );

  // Handle AudioContext state changes and auto-resume
  useEffect(() => {
    const handleStateChange = () => {
      setAudioContextState(globalAudioContext.state);
    };
    globalAudioContext.addEventListener("statechange", handleStateChange);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && globalAudioContext.state === "suspended") {
        globalAudioContext.resume().catch(console.warn);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      globalAudioContext.removeEventListener("statechange", handleStateChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Unified Audio Unlocker
  const unlockAudio = async () => {
    if (globalAudioContext.state === "suspended") {
      try {
        await globalAudioContext.resume();
      } catch (e) {
        console.error("[Audio] Manual resume failed:", e);
      }
    }

    // Play silent sound to unlock iOS
    try {
      const osc = globalAudioContext.createOscillator();
      const silentGain = globalAudioContext.createGain();
      silentGain.gain.value = 0.00001;
      osc.connect(silentGain);
      silentGain.connect(globalAudioContext.destination);
      osc.start(0);
      osc.stop(globalAudioContext.currentTime + 0.1);
    } catch (e) {
      console.warn("[Audio] Unlock sound failed:", e);
    }

    setAudioContextState(globalAudioContext.state);
  };

  // Automated first-gesture handler
  useEffect(() => {
    if (audioContextState === "running") return;
    const handleGesture = () => {
      unlockAudio();
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };
    window.addEventListener("click", handleGesture);
    window.addEventListener("touchstart", handleGesture, { passive: true });
    return () => {
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };
  }, [audioContextState]);

  const { state: deckAState, controls: deckA } = useDeck({
    audioContext: globalAudioContext,
    destination: deckAGain,
    deckId: "A",
  });

  const { state: deckBState, controls: deckB } = useDeck({
    audioContext: globalAudioContext,
    destination: deckBGain,
    deckId: "B",
  });

  // Screen Wake Lock
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const isPlaying = deckAState.isPlaying || deckBState.isPlaying;

    const requestWakeLock = async () => {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request("screen");
        } catch (err) {
          console.warn("Wake Lock request failed:", err);
        }
      }
    };

    if (isPlaying) requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isPlaying) requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (wakeLock) wakeLock.release().catch(console.warn);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deckAState.isPlaying, deckBState.isPlaying]);

  // Update crossfader
  useEffect(() => {
    const deckAVolume = 1 - crossfader / 100;
    const deckBVolume = crossfader / 100;
    deckAGain.gain.value = deckAVolume;
    deckBGain.gain.value = deckBVolume;
  }, [crossfader]);

  const downloadingTracksRef = useRef<Set<string>>(new Set());

  // Load tracks from DB and Cache
  useEffect(() => {
    const loadTracks = async () => {
      try {
        const storedTracks = await getAllTracksFromDB();
        let cachedTracks: Track[] = [];
        try {
          const res = await fetch(`${API_ENDPOINTS.CACHE_LIST}`);
          if (res.ok) cachedTracks = await res.json();
        } catch (e) { console.warn("Failed to fetch cache list", e); }

        const combined = [...storedTracks];
        cachedTracks.forEach(ct => {
          if (!combined.find(t => t.id === ct.id)) combined.push(ct);
        });
        setTracks(combined);
      } catch (err) { console.error("Failed to load tracks", err); }
    };
    loadTracks();
  }, []);

  const handleImportTrack = async (track: Track, deckId: 'A' | 'B') => {
    const deck = deckId === 'A' ? deckA : deckB;
    if (track.file) {
      await deck.loadTrack(track);
      if (!tracks.find(t => t.id === track.id)) {
        await saveTrackToDB(track);
        setTracks(prev => [track, ...prev]);
      }
    } else {
      if (downloadingTracksRef.current.has(track.id)) return;
      downloadingTracksRef.current.add(track.id);
      deck.setIsLoading(true);
      try {
        const res = await fetch(`${API_ENDPOINTS.DOWNLOAD}?videoId=${track.id}`);
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const file = new File([blob], `${track.name}.mp3`, { type: 'audio/mpeg' });
        const localTrack = { ...track, file, url: URL.createObjectURL(file) };
        await deck.loadTrack(localTrack);
        await saveTrackToDB(localTrack);
        setTracks(prev => [localTrack, ...prev.filter(t => t.id !== track.id)]);
      } catch (err) {
        console.error("Track download failed", err);
        alert("Failed to download track for mixing.");
      } finally {
        downloadingTracksRef.current.delete(track.id);
        deck.setIsLoading(false);
      }
    }
  };

  const handleCrossfaderChange = (val: number) => setCrossfader(val);
  const handleVolumeChange = (deckId: 'A' | 'B', val: number) => {
    const deck = deckId === 'A' ? deckA : deckB;
    deck.setVolume(val);
  };
  const handleEQChange = (deckId: 'A' | 'B', band: 'low' | 'mid' | 'high', val: number) => {
    const deck = deckId === 'A' ? deckA : deckB;
    deck.setEQ(band, val);
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSettingsOpen || isTrackSelectorOpen) return;
      if (e.target instanceof HTMLInputElement) return;

      const action = Object.entries(keyMap).find(([_, code]) => code === e.code)?.[0];
      if (!action) return;

      e.preventDefault();
      switch (action) {
        case 'DECK_A_PLAY': deckAState.isPlaying ? deckA.pause() : deckA.play(); break;
        case 'DECK_A_CUE': deckA.handleCue(0); break;
        case 'DECK_B_PLAY': deckBState.isPlaying ? deckB.pause() : deckB.play(); break;
        case 'DECK_B_CUE': deckB.handleCue(0); break;
        case 'VOLUME_A_UP': deckA.setVolume(v => Math.min(150, v + 5)); break;
        case 'VOLUME_A_DOWN': deckA.setVolume(v => Math.max(0, v - 5)); break;
        case 'VOLUME_B_UP': deckB.setVolume(v => Math.min(150, v + 5)); break;
        case 'VOLUME_B_DOWN': deckB.setVolume(v => Math.max(0, v - 5)); break;
        case 'CROSSFADER_LEFT': setCrossfader(v => Math.max(0, v - 5)); break;
        case 'CROSSFADER_RIGHT': setCrossfader(v => Math.min(100, v + 5)); break;
        case 'EFFECT_A_TOGGLE': deckA.toggleEffect('filter'); break;
        case 'EFFECT_B_TOGGLE': deckB.toggleEffect('filter'); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyMap, deckA, deckB, deckAState.isPlaying, deckBState.isPlaying, isSettingsOpen, isTrackSelectorOpen]);

  return (
    <div className="app">
      {/* Custom Orientation Warning UI */}
      <div className="orientation-warning">
        <div className="orientation-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
          </svg>
        </div>
        <h2>Please Rotate Your Device</h2>
        <p>This DJ interface is optimized for landscape mode.</p>
      </div>

      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <h1 className="app-title">DJ PRO MASTER</h1>
        </div>

        <div className="settings-btn-container">
          {updateAvailable && (
            <button className="update-notification-btn" onClick={handleUpdate} title="Update Available">
              Update
            </button>
          )}
          <button className="settings-btn" onClick={() => setIsTrackSelectorOpen(true)} title="Open Library">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </button>
          <button className="settings-btn" onClick={() => setIsSettingsOpen(true)} title="Settings">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Audio Unlock Overlay */}
      {audioContextState !== "running" && (
        <div className="audio-unlock-overlay" onClick={unlockAudio}>
          <div className="unlock-content">
            <div className="unlock-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <h2>
              {audioContextState === "uninitialized"
                ? "Ready to Mix?"
                : `Audio is currently ${audioContextState}. Tap to retry.`}
            </h2>
            <p>Tap anywhere to start your DJ session.</p>
            <button className="unlock-button">
              {audioContextState === "uninitialized"
                ? "START SESSION"
                : "RESUME AUDIO"}
            </button>
            {audioContextState !== "uninitialized" && (
              <div className="audio-status-pill">
                Status: {audioContextState}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Buttons (Mobile Overlay) */}
      <div className="floating-actions">
        <button
          className="settings-floating-btn"
          onClick={() => setIsTrackSelectorOpen(true)}
          title="Open Library"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        </button>
        <button
          className="settings-floating-btn"
          onClick={() => setIsSettingsOpen(true)}
          title="Open Settings"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <main className="app-main">
        <div className="decks-section">
          <Deck
            deckId="A"
            state={deckAState}
            controls={deckA}
            color="#ff0080"
            shortcuts={
              !isMobile
                ? {
                  play: getKeyLabel(keyMap["DECK_A_PLAY"], layout),
                  cue: getKeyLabel(keyMap["DECK_A_CUE"], layout),
                  effect: getKeyLabel(keyMap["EFFECT_A_TOGGLE"], layout),
                }
                : undefined
            }
          />

          <section className="center-section">
            <Mixer
              crossfaderValue={crossfader}
              onCrossfaderChange={handleCrossfaderChange}
              deckAState={deckAState}
              deckBState={deckBState}
              onVolumeChange={handleVolumeChange}
              onEQChange={handleEQChange}
            />
          </section>

          <Deck
            deckId="B"
            state={deckBState}
            controls={deckB}
            color="#00d4ff"
            shortcuts={
              !isMobile
                ? {
                  play: getKeyLabel(keyMap["DECK_B_PLAY"], layout),
                  cue: getKeyLabel(keyMap["DECK_B_CUE"], layout),
                  effect: getKeyLabel(keyMap["EFFECT_B_TOGGLE"], layout),
                }
                : undefined
            }
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

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />

        <InstallPWA />
      </main>
    </div>
  );
}

export default App;
