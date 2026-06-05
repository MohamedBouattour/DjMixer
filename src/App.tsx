import { useState, useEffect, useRef } from "react";
import { Deck } from "./components/Deck";
import { Mixer } from "./components/Mixer";
import { SmartMixPanel } from "./components/SmartMixPanel";
import { UnifiedTrackSelector } from "./components/UnifiedTrackSelector";
import { SettingsModal } from "./components/SettingsModal";
import { AuthModal } from "./components/AuthModal";

import { useDeck } from "./hooks/useDeck";
import { useSmartMix } from "./hooks/useSmartMix";
import type { Track } from "./types";
import { getAllTracksFromDB, saveTrackToDB, deleteTrackFromDB } from "./utils/storage";
import { useSettings } from "./contexts/SettingsContext";
import { useAuth } from "./contexts/AuthContext";
import { getKeyLabel } from "./utils/keyHelpers";
import { API_ENDPOINTS } from "./config";

declare const __BUILD_DATE__: string;

const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const globalAudioContext = new AudioContextClass();

let workletLoaded = false;
const loadWorklets = async () => {
  if (workletLoaded) return;
  try {
    await globalAudioContext.audioWorklet.addModule('/worklets/scratch-processor.js');
    console.log('[AudioWorklet] scratch-processor loaded');
    workletLoaded = true;
  } catch (e) {
    console.error('[AudioWorklet] failed to load:', e);
  }
};

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
  const [isWorkletReady, setIsWorkletReady] = useState(false);
  const { keyMap, layout } = useSettings();
  const { user, isAuthenticated, logout } = useAuth();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

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
            localStorage.setItem("app_version", remoteVersion);
            window.location.reload();
          }
        }
      } catch (e) {
        console.warn("[VERSION] Check failed:", e);
      }
    };

    checkVersion();
    loadWorklets().then(() => setIsWorkletReady(true));
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

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

  const unlockAudio = async () => {
    if (globalAudioContext.state === "suspended") {
      try {
        await globalAudioContext.resume();
      } catch (e) {
        console.error("[Audio] Manual resume failed:", e);
      }
    }
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
    isWorkletReady
  });

  const { state: deckBState, controls: deckB } = useDeck({
    audioContext: globalAudioContext,
    destination: deckBGain,
    deckId: "B",
    isWorkletReady
  });

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

  useEffect(() => {
    const deckAVolume = 1 - crossfader / 100;
    const deckBVolume = crossfader / 100;
    deckAGain.gain.value = deckAVolume;
    deckBGain.gain.value = deckBVolume;
  }, [crossfader]);

  const downloadingTracksRef = useRef<Set<string>>(new Set());

  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) headers['Authorization'] = `Bearer ${user.token}`;
    return headers;
  };

  // Load tracks from DB and User Sync
  useEffect(() => {
    const loadTracks = async () => {
      try {
        const storedTracks = await getAllTracksFromDB();
        let userTracks: any[] = [];
        if (isAuthenticated && user?.id) {
          try {
            const res = await fetch(API_ENDPOINTS.USER_TRACKS(user.id), {
              headers: authHeaders()
            });
            if (res.ok) userTracks = await res.json();
          } catch (e) { console.warn("Failed to fetch user tracks", e); }
        }
        const combined = [...storedTracks];
        userTracks.forEach(ut => {
          if (!combined.find(t => t.id === ut.id)) {
            combined.push({
              ...ut,
              url: `${API_ENDPOINTS.STREAM}?videoId=${ut.id}`
            } as Track);
          }
        });
        setTracks(combined);
      } catch (err) { console.error("Failed to load tracks", err); }
    };
    loadTracks();
  }, [isAuthenticated, user?.id]);

  const syncTracksToBackend = async (updatedTracks: Track[]) => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const serializableTracks = updatedTracks.map(({ file, ...track }) => track);
      await fetch(API_ENDPOINTS.USER_TRACKS(user.id), {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify({ tracks: serializableTracks })
      });
    } catch (e) {
      console.warn("Failed to sync tracks to backend", e);
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    try {
      await deleteTrackFromDB(track.id);
    } catch (e) {
      console.warn("Failed to delete track from local DB", e);
    }
    if (isAuthenticated && user?.id) {
      try {
        await fetch(`${API_ENDPOINTS.USER_TRACKS(user.id)}/${track.id}`, {
          method: 'DELETE',
          headers: { ...authHeaders() }
        });
      } catch (e) {
        console.warn("Failed to delete track from backend", e);
      }
    }
    const newTracks = tracks.filter(t => t.id !== track.id);
    setTracks(newTracks);
  };

  const handleTracksChange = (newTracks: Track[]) => {
    setTracks(newTracks);
    syncTracksToBackend(newTracks);
  };

  const handleImportTrack = async (track: Track, deckId: 'A' | 'B', silent = false) => {
    const deck = deckId === 'A' ? deckA : deckB;
    if (track.file) {
      await deck.loadTrack(track);
      if (!tracks.find(t => t.id === track.id)) {
        await saveTrackToDB(track);
        const newTracks = [track, ...tracks];
        setTracks(newTracks);
        syncTracksToBackend(newTracks);
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
        const newTracks = [localTrack, ...tracks.filter(t => t.id !== track.id)];
        setTracks(newTracks);
        syncTracksToBackend(newTracks);
      } catch (err) {
        console.error("Track download failed", err);
        if (!silent) {
          alert("Failed to download track for mixing.");
        }
        if (silent) {
          throw err;
        }
      } finally {
        downloadingTracksRef.current.delete(track.id);
        deck.setIsLoading(false);
      }
    }
  };

  // Smart Mix V2
  const smartMix = useSmartMix({
    deckAState,
    deckBState,
    deckAControls: deckA,
    deckBControls: deckB,
    tracks,
    onImportTrack: handleImportTrack,
  });

  const handleDoubleClickQueueTrack = async (track: Track) => {
    // Determine the free deck:
    // The free deck is the one not playing, or if both/neither are, the one with lower volume.
    let freeDeckId: 'A' | 'B' = 'B';
    
    const volA = deckAState.volume;
    const volB = deckBState.volume;
    const isPlayingA = deckAState.isPlaying;
    const isPlayingB = deckBState.isPlaying;
    
    if (isPlayingA && !isPlayingB) {
      freeDeckId = 'B';
    } else if (isPlayingB && !isPlayingA) {
      freeDeckId = 'A';
    } else {
      freeDeckId = volA <= volB ? 'A' : 'B';
    }

    console.log(`[Queue] Double-clicked to load ${track.name} to free deck ${freeDeckId}`);
    
    // Load it
    await handleImportTrack(track, freeDeckId, true);
    
    // Set its volume lower (40%)
    const freeDeckControls = freeDeckId === 'A' ? deckA : deckB;
    freeDeckControls.setVolume(40);
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

  const activeTrack = smartMix.activeDeck === 'A' ? deckAState.track : deckBState.track;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSettingsOpen || isTrackSelectorOpen) return;
      if (e.target instanceof HTMLInputElement) return;

      if (e.code === 'Escape') {
        e.preventDefault();
        deckA.clearLoop();
        deckB.clearLoop();
        console.log('[Shortcuts] Cleared all deck loops via Escape key');
        return;
      }

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
    <div className="w-full h-dvh flex flex-col overflow-hidden relative pt-[env(safe-area-inset-top,5px)] pb-[env(safe-area-inset-bottom,5px)] pl-[env(safe-area-inset-left,5px)] pr-[env(safe-area-inset-right,5px)] bg-[repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(255,255,255,0.01)_1px,rgba(255,255,255,0.01)_2px)] bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d]">
      {/* Custom Orientation Warning UI */}
      <div className="hidden portrait-mobile:flex fixed inset-0 bg-bg-darkest z-[9999] flex-col items-center justify-center text-center p-8 text-white">
        <div className="w-16 h-16 mb-5 animate-[rotate-phone_2s_infinite_ease-in-out]">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Please Rotate Your Device</h2>
        <p className="text-text-secondary">This DJ interface is optimized for landscape mode.</p>
      </div>

      <header className="flex items-center justify-between px-5 py-2.5 bg-black/80 backdrop-blur-lg border-b border-white/10 z-[1000] h-15">
        <div className="flex items-center gap-3">
          <div className="text-deck-a flex items-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-[1.2rem] font-bold tracking-widest text-white m-0 uppercase leading-tight">DJ PRO MASTER</h1>
            <span className="text-[10px] text-white/40 tracking-widest leading-tight">v.{typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev'}</span>
          </div>
        </div>

        <div className="flex items-center gap-[15px]">

          {/* Auth Button / User Avatar */}
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 group relative">
              <button
                title={`${user.username} — click to sign out`}
                onClick={logout}
                className="w-9 h-9 rounded-full border-2 border-deck-a/60 overflow-hidden flex items-center justify-center bg-bg-header hover:border-deck-a transition-all duration-200"
              >
                {user.picture ? (
                  <img src={user.picture} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[13px] font-bold text-deck-a uppercase">
                    {user.username.slice(0, 2)}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <button
              className="bg-[rgba(40,40,40,0.6)] border border-deck-a/30 text-deck-a w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-deck-a/10 hover:border-deck-a hover:-translate-y-0.5 text-xs font-bold"
              onClick={() => setIsAuthOpen(true)}
              title="Sign In"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </button>
          )}

          {/* Smart Mix Toggle */}
          <button
            className={`relative flex items-center gap-1.5 h-10 px-3 rounded-lg font-bold text-[11px] tracking-wider uppercase transition-all duration-300 ${
              smartMix.isActive
                ? 'bg-gradient-to-r from-deck-a to-deck-b text-white border border-white/20 shadow-[0_0_20px_rgba(255,0,128,0.4),0_0_20px_rgba(0,212,255,0.4)] animate-[auto-mix-pulse_2s_ease-in-out_infinite]'
                : 'bg-[rgba(40,40,40,0.6)] border border-white/10 text-[#aaa] hover:bg-[rgba(60,60,60,0.8)] hover:text-white hover:border-white/30 hover:-translate-y-0.5'
            }`}
            onClick={smartMix.toggle}
            title={smartMix.isActive ? 'Stop Smart Mix' : 'Start Smart Mix'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.6 6.62c-1.44 0-2.8.56-3.77 1.53L7.8 14.39c-.64.64-1.49.99-2.4.99-1.87 0-3.39-1.51-3.39-3.38S3.53 8.62 5.4 8.62c.91 0 1.76.35 2.44 1.03l1.13 1 1.51-1.34L9.22 8.2C8.2 7.18 6.84 6.62 5.4 6.62 2.42 6.62 0 9.04 0 12s2.42 5.38 5.4 5.38c1.44 0 2.8-.56 3.77-1.53l7.03-6.24c.64-.64 1.49-.99 2.4-.99 1.87 0 3.39 1.51 3.39 3.38s-1.52 3.38-3.39 3.38c-.9 0-1.76-.35-2.44-1.03l-1.14-1.01-1.51 1.34 1.27 1.12c1.02 1.01 2.37 1.57 3.82 1.57 2.98 0 5.4-2.41 5.4-5.38s-2.42-5.37-5.4-5.37z" />
            </svg>
            <span>SMART</span>
            {smartMix.isActive && smartMix.statusText && (
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-white/70 whitespace-nowrap font-normal tracking-normal normal-case">
                {smartMix.statusText}
              </span>
            )}
          </button>

          <button className="bg-[rgba(40,40,40,0.6)] border border-white/10 text-[#aaa] w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[rgba(60,60,60,0.8)] hover:text-white hover:border-white/30 hover:-translate-y-0.5" onClick={() => setIsTrackSelectorOpen(true)} title="Open Library">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </button>
          <button className="bg-[rgba(40,40,40,0.6)] border border-white/10 text-[#aaa] w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[rgba(60,60,60,0.8)] hover:text-deck-a hover:border-deck-a/40 hover:-translate-y-0.5" onClick={() => setIsSettingsOpen(true)} title="Settings">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Audio Unlock Overlay */}
      {audioContextState !== "running" && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[5000] flex items-center justify-center cursor-pointer" onClick={unlockAudio}>
          <div className="bg-bg-panel border border-white/10 p-10 rounded-2xl max-w-sm w-full text-center shadow-2xl scale-100 active:scale-95 transition-transform">
            <div className="text-deck-a flex justify-center mb-6 drop-shadow-[0_0_15px_rgba(255,0,128,0.5)]">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 tracking-tight">
              {audioContextState === "uninitialized"
                ? "Ready to Mix?"
                : `Audio is currently ${audioContextState}. Tap to retry.`}
            </h2>
            <p className="text-text-secondary mb-8 text-sm">Tap anywhere to start your DJ session.</p>
            <button className="w-full py-4 bg-deck-a text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,0,128,0.4)] hover:brightness-110 active:scale-98 transition-all">
              {audioContextState === "uninitialized"
                ? "START SESSION"
                : "RESUME AUDIO"}
            </button>
            {audioContextState !== "uninitialized" && (
              <div className="mt-4 text-[10px] text-text-muted uppercase tracking-widest">
                Status: {audioContextState}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Buttons (Mobile Overlay) */}
      {isMobile && (
        <div className="fixed top-[max(8px,env(safe-area-inset-top))] right-[87%] flex flex-row gap-[10px] z-[2000] landscape:top-[max(10px,env(safe-area-inset-top))] landscape:right-1/2 landscape:translate-x-1/2 landscape:gap-3 landscape-sm:top-[5px] landscape-sm:gap-2">
          <button
            className="w-[98px] h-[98px] rounded-full bg-[rgba(30,30,30,0.95)] border-[3px] border-white/20 text-[#aaa] flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-xl shadow-[0_2px_10px_rgba(0,0,0,0.5)] hover:bg-[rgba(50,50,50,0.98)] hover:text-white hover:border-white/40 hover:scale-105 border-deck-b/50 text-deck-b hover:border-deck-b hover:shadow-[0_2px_15px_rgba(0,212,255,0.4)] landscape:w-[85px] landscape:h-[85px] landscape-sm:w-[78px] landscape-sm:h-[78px]"
            onClick={() => setIsTrackSelectorOpen(true)}
            title="Open Library"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="landscape:w-[42px] landscape:h-[42px] landscape-sm:w-[36px] landscape-sm:h-[36px]">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </button>
          <button
            className="w-[98px] h-[98px] rounded-full bg-[rgba(30,30,30,0.95)] border-[3px] border-white/20 text-[#aaa] flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-xl shadow-[0_2px_10px_rgba(0,0,0,0.5)] hover:bg-[rgba(50,50,50,0.98)] hover:text-white hover:border-white/40 hover:scale-105 border-deck-a/40 hover:border-deck-a hover:shadow-[0_2px_15px_rgba(255,0,128,0.4)] landscape:w-[85px] landscape:h-[85px] landscape-sm:w-[78px] landscape-sm:h-[78px]"
            onClick={() => setIsSettingsOpen(true)}
            title="Open Settings"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="landscape:w-[42px] landscape:h-[42px] landscape-sm:w-[36px] landscape-sm:h-[36px]">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      <main className="flex-1 flex p-0 overflow-hidden landscape:pl-[max(5px,env(safe-area-inset-left))] landscape:pr-[max(5px,env(safe-area-inset-right))]">
        <div className="flex-1 flex gap-0 min-h-0 w-full max-md:flex-col">
          <Deck
            deckId="A"
            state={deckAState}
            controls={deckA}
            color="#ff0080"
            isAutoMixActive={smartMix.isActive}
            isAutoMixIdle={smartMix.activeDeck === 'B'}
            onAutoMixRefetch={smartMix.refreshSuggestions}
            onAutoMixTrigger={smartMix.triggerTransition}
            autoMixPhase={smartMix.phase}
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

          <section className="w-[16%] flex flex-col gap-0 overflow-hidden shrink-0 min-w-[100px] max-md:w-full md:max-w-none md:min-w-0 md:w-auto">
            <Mixer
              crossfaderValue={crossfader}
              onCrossfaderChange={handleCrossfaderChange}
              deckAState={deckAState}
              deckBState={deckBState}
              onVolumeChange={handleVolumeChange}
              onEQChange={handleEQChange}
              isAutoMixActive={smartMix.isActive}
              activeDeck={smartMix.activeDeck}
              onTriggerTransition={smartMix.triggerTransition}
            />
          </section>

          <Deck
            deckId="B"
            state={deckBState}
            controls={deckB}
            color="#00d4ff"
            isAutoMixActive={smartMix.isActive}
            isAutoMixIdle={smartMix.activeDeck === 'A'}
            onAutoMixRefetch={smartMix.refreshSuggestions}
            onAutoMixTrigger={smartMix.triggerTransition}
            autoMixPhase={smartMix.phase}
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

        <SmartMixPanel
          isActive={smartMix.isActive}
          phase={smartMix.phase}
          statusText={smartMix.statusText}
          suggestions={smartMix.suggestions}
          queue={smartMix.queue}
          queueIndex={smartMix.queueIndex}
          isAiPowered={smartMix.isAiPowered}
          currentTrackName={activeTrack?.name}
          currentTrackArtist={activeTrack?.artist}
          currentTrackBpm={activeTrack?.bpm}
          onToggle={smartMix.toggle}
          onSelectSuggestion={smartMix.selectSuggestion}
          onQueueAll={smartMix.queueAll}
          onAddToQueue={smartMix.addToQueue}
          onRemoveFromQueue={smartMix.removeFromQueue}
          onReorderQueue={smartMix.reorderQueue}
          onRefreshSuggestions={smartMix.refreshSuggestions}
          onClearQueue={smartMix.clearQueue}
          onTriggerTransition={smartMix.triggerTransition}
          onDoubleClickQueueItem={handleDoubleClickQueueTrack}
          onAddTrackFromYt={smartMix.addTrackFromYt}
        />

        <UnifiedTrackSelector
          isOpen={isTrackSelectorOpen}
          onClose={() => setIsTrackSelectorOpen(false)}
          tracks={tracks}
          onTracksChange={handleTracksChange}
          onLoadTrack={handleImportTrack}
          onDeleteTrack={handleDeleteTrack}
          isPlayingA={deckAState.isPlaying}
          isPlayingB={deckBState.isPlaying}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />

        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
        />
      </main>
    </div>
  );
}

export default App;
