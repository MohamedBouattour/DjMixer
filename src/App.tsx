import { useState, useEffect, useRef } from "react";
import { Deck } from "./components/Deck";
import { Mixer } from "./components/Mixer";
import { SettingsModal } from "./components/SettingsModal";
import { SmartPanel } from "./components/SmartPanel";

import { useDeck } from "./hooks/useDeck";
import { useApiCounter } from "./hooks/useApiCounter";
import type { Track } from "./types";
import { getAllTracksFromDB, saveTrackToDB, deleteTrackFromDB } from "./utils/storage";
import { useSettings } from "./contexts/SettingsContext";
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
  const [isWorkletReady, setIsWorkletReady] = useState(false);
  const { keyMap, layout } = useSettings();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [queue, setQueue] = useState<Track[]>([]);
  const [smartPanelKey, setSmartPanelKey] = useState(0);
  const { count: apiCount, increment: incrementApiCount } = useApiCounter();

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.VERSION);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.version && data.version !== "dev" && data.version !== "unknown") {
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
    const isPlayingRef = { current: deckAState.isPlaying || deckBState.isPlaying };
    const requestWakeLock = async () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request("screen");
        } catch (err) {
          console.warn("Wake Lock request failed:", err);
        }
      }
    };
    if (isPlayingRef.current) requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isPlayingRef.current) requestWakeLock();
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

  const downloadingTracksRef = new Set<string>();

  // Load tracks from local DB
  useEffect(() => {
    const loadTracks = async () => {
      try {
        const storedTracks = await getAllTracksFromDB();
        setTracks(storedTracks);
      } catch (err) { console.error("Failed to load tracks", err); }
    };
    loadTracks();
  }, []);

  const handleDeleteTrack = async (track: Track) => {
    try {
      await deleteTrackFromDB(track.id);
    } catch (e) {
      console.warn("Failed to delete track from local DB", e);
    }
    setTracks(prev => prev.filter(t => t.id !== track.id));
  };

  const handleImportTrack = async (track: Track, deckId: 'A' | 'B', silent = false) => {
    const deck = deckId === 'A' ? deckA : deckB;
    if (track.file) {
      await deck.loadTrack(track);
      if (!tracks.find(t => t.id === track.id)) {
        await saveTrackToDB(track);
        setTracks(prev => [track, ...prev]);
      }
    } else {
      if (downloadingTracksRef.has(track.id)) return;
      downloadingTracksRef.add(track.id);
      deck.setIsLoading(true);
      try {
        const res = await fetch(`${API_ENDPOINTS.STREAM}?videoId=${track.id}`);
        incrementApiCount();
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const file = new File([blob], `${track.name}.mp3`, { type: 'audio/mpeg' });
        const localTrack = { ...track, file, url: URL.createObjectURL(file) };
        await deck.loadTrack(localTrack);
        await saveTrackToDB(localTrack);
        setTracks(prev => [localTrack, ...prev.filter(t => t.id !== track.id)]);
      } catch (err) {
        console.error("Track download failed", err);
        if (!silent) alert("Failed to download track for mixing.");
        if (silent) throw err;
      } finally {
        downloadingTracksRef.delete(track.id);
        deck.setIsLoading(false);
      }
    }
  };

  const handleAddToQueue = (track: Track) => {
    setQueue(prev => [...prev, track]);
  };

  const handleRemoveFromQueue = (trackId: string) => {
    setQueue(prev => prev.filter(t => t.id !== trackId));
  };

  const handleClearQueue = () => {
    setQueue([]);
  };

  const prevPlayingARef = useRef(deckAState.isPlaying);
  const prevPlayingBRef = useRef(deckBState.isPlaying);
  const deckARef = useRef(deckA);
  const deckBRef = useRef(deckB);
  const deckAStateRef = useRef(deckAState);
  const deckBStateRef = useRef(deckBState);
  const importTrackRef = useRef(handleImportTrack);
  const queueRef = useRef(queue);

  deckARef.current = deckA;
  deckBRef.current = deckB;
  deckAStateRef.current = deckAState;
  deckBStateRef.current = deckBState;
  importTrackRef.current = handleImportTrack;
  queueRef.current = queue;

  useEffect(() => {
    const wasA = prevPlayingARef.current;
    const wasB = prevPlayingBRef.current;
    const isA = deckAState.isPlaying;
    const isB = deckBState.isPlaying;
    prevPlayingARef.current = isA;
    prevPlayingBRef.current = isB;

    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;

    const tryPlayNext = async (deckId: 'A' | 'B') => {
      const nextTrack = currentQueue[0];
      if (!nextTrack) return;
      setQueue(prev => prev.slice(1));
      const deck = deckId === 'A' ? deckARef.current : deckBRef.current;
      const state = deckId === 'A' ? deckAStateRef.current : deckBStateRef.current;
      if (state.track && state.track.id === nextTrack.id) return;
      await importTrackRef.current(nextTrack, deckId, true);
      deck.setVolume(85);
      setTimeout(() => deck.play(), 100);
    };

    if (wasA && !isA && deckAState.track) {
      tryPlayNext('A');
    } else if (wasB && !isB && deckBState.track) {
      tryPlayNext('B');
    } else if (!isA && !isB) {
      const deckAIdle = !deckAState.track || !isA;
      const deckBIdle = !deckBState.track || !isB;
      if (deckAIdle && !deckBIdle) {
        tryPlayNext('A');
      } else if (deckBIdle && !deckAIdle) {
        tryPlayNext('B');
      } else if (deckAIdle && deckBIdle) {
        tryPlayNext('A');
      }
    }
  }, [deckAState.isPlaying, deckBState.isPlaying, deckAState.track, deckBState.track]);

  const handleCrossfaderChange = (val: number) => setCrossfader(val);
  const handleVolumeChange = (deckId: 'A' | 'B', val: number) => {
    (deckId === 'A' ? deckA : deckB).setVolume(val);
  };
  const handleEQChange = (deckId: 'A' | 'B', band: 'low' | 'mid' | 'high', val: number) => {
    (deckId === 'A' ? deckA : deckB).setEQ(band, val);
  };

  const activeTrack = deckAState.isPlaying ? deckAState.track : deckBState.isPlaying ? deckBState.track : null;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSettingsOpen) return;
      if (e.target instanceof HTMLInputElement) return;

      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        deckA.clearLoop();
        deckB.clearLoop();
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
  }, [keyMap, deckA, deckB, deckAState.isPlaying, deckBState.isPlaying, isSettingsOpen]);

  return (
    <div className="w-full h-dvh flex flex-col overflow-hidden relative pt-[env(safe-area-inset-top,5px)] pb-[env(safe-area-inset-bottom,5px)] pl-[env(safe-area-inset-left,5px)] pr-[env(safe-area-inset-right,5px)] bg-[repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(255,255,255,0.01)_1px,rgba(255,255,255,0.01)_2px)] bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d]">
      <div className="hidden portrait-mobile:flex fixed inset-0 bg-bg-darkest z-[9999] flex-col items-center justify-center text-center p-8 text-white">
        <div className="w-16 h-16 mb-5 animate-[rotate-phone_2s_infinite_ease-in-out]">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Please Rotate Your Device</h2>
        <p className="text-text-secondary">This DJ interface is optimized for landscape mode.</p>
      </div>

      <header className="flex items-center justify-between px-2 py-0.5 bg-black/80 backdrop-blur-lg border-b border-white/10 z-[1000] h-7">
        <div className="flex items-center gap-1.5">
          <div className="text-deck-a flex items-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <div className="flex flex-col justify-center leading-none">
            <h1 className="text-[0.7rem] font-bold tracking-widest text-white m-0 uppercase leading-none">DJ PRO MASTER</h1>
            <span className="text-[7px] text-white/40 tracking-widest leading-none">v.{typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="text-[8px] font-mono font-bold">{apiCount}</span>
          </div>

          <button className="bg-[rgba(40,40,40,0.6)] border border-white/10 text-[#aaa] w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[rgba(60,60,60,0.8)] hover:text-white hover:border-white/30" onClick={() => setSmartPanelKey(s => s + 1)} title="Open Library & Queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </button>
          <button className="bg-[rgba(40,40,40,0.6)] border border-white/10 text-[#aaa] w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[rgba(60,60,60,0.8)] hover:text-deck-a hover:border-deck-a/40" onClick={() => setIsSettingsOpen(true)} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Floating Action Buttons (Mobile Overlay) */}
      {isMobile && (
        <div className="fixed top-[max(8px,env(safe-area-inset-top))] right-[87%] flex flex-row gap-[10px] z-[2000] landscape:top-[max(10px,env(safe-area-inset-top))] landscape:right-1/2 landscape:translate-x-1/2 landscape:gap-3 landscape-sm:top-[5px] landscape-sm:gap-2">
          <button
            className="w-[98px] h-[98px] rounded-full bg-[rgba(30,30,30,0.95)] border-[3px] border-white/20 text-[#aaa] flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-xl shadow-[0_2px_10px_rgba(0,0,0,0.5)] hover:bg-[rgba(50,50,50,0.98)] hover:text-white hover:border-white/40 hover:scale-105 border-deck-b/50 text-deck-b hover:border-deck-b hover:shadow-[0_2px_15px_rgba(0,212,255,0.4)] landscape:w-[85px] landscape:h-[85px] landscape-sm:w-[78px] landscape-sm:h-[78px]"
            onClick={() => setSmartPanelKey(s => s + 1)}
            title="Open Library & Queue"
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

        <SmartPanel
          key={smartPanelKey ? `sp-${smartPanelKey}` : 'sp-default'}
          queue={queue}
          onAddToQueue={handleAddToQueue}
          onRemoveFromQueue={handleRemoveFromQueue}
          onClearQueue={handleClearQueue}
          tracks={tracks}
          onTracksChange={setTracks}
          onLoadTrack={handleImportTrack}
          onDeleteTrack={handleDeleteTrack}
          currentTrackName={activeTrack?.name}
          currentTrackArtist={activeTrack?.artist}
          onApiCall={incrementApiCount}
          isPlayingA={deckAState.isPlaying}
          isPlayingB={deckBState.isPlaying}
          defaultOpen={smartPanelKey > 0}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </main>
    </div>
  );
}

export default App;
