import { useState, useEffect, useRef } from "react";
import { Deck } from "./components/Deck";
import { Mixer } from "./components/Mixer";
import { SettingsModal } from "./components/SettingsModal";
import { TrackLibrary } from "./components/TrackLibrary";

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
  const { increment: incrementApiCount } = useApiCounter();

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
    <div className="w-full h-dvh flex flex-col overflow-hidden relative pt-[env(safe-area-inset-top,5px)] pb-[env(safe-area-inset-bottom,5px)] pl-[env(safe-area-inset-left,5px)] pr-[env(safe-area-inset-right,5px)] bg-surface-dim">
      {/* Ambient glow background */}
      <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-screen blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary rounded-full mix-blend-screen blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="hidden portrait-mobile:flex fixed inset-0 bg-surface-dim z-[9999] flex-col items-center justify-center text-center p-8 text-white">
        <div className="w-16 h-16 mb-5 animate-[rotate-phone_2s_infinite_ease-in-out]">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Please Rotate Your Device</h2>
        <p className="text-on-surface-variant">This DJ interface is optimized for landscape mode.</p>
      </div>

      <main className="flex-1 flex p-0 overflow-hidden landscape:pl-[max(5px,env(safe-area-inset-left))] landscape:pr-[max(5px,env(safe-area-inset-right))] mb-[40px]">
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

          <section className="w-[32%] min-w-[290px] max-w-[400px] flex flex-col gap-0 overflow-hidden shrink-0 max-md:w-full md:max-w-none md:min-w-0 md:w-auto bg-surface-container-low/30 backdrop-blur-sm border-x border-white/5">
            <Mixer
              crossfaderValue={crossfader}
              onCrossfaderChange={handleCrossfaderChange}
              deckAState={deckAState}
              deckBState={deckBState}
              onVolumeChange={handleVolumeChange}
              onEQChange={handleEQChange}
              onGainChange={(deckId, val) => (deckId === 'A' ? deckA : deckB).setGain(val)}
              onFilterChange={(deckId, val) => (deckId === 'A' ? deckA : deckB).setEffect('filter', val)}
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

        <TrackLibrary
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
          currentTrackId={activeTrack?.id}
          onApiCall={incrementApiCount}
          isPlayingA={deckAState.isPlaying}
          isPlayingB={deckBState.isPlaying}
          onOpenSettings={() => setIsSettingsOpen(true)}
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
