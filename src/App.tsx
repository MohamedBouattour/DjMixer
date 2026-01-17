import { useState, useEffect, useRef } from 'react';
import { Deck } from './components/Deck';
import { Mixer } from './components/Mixer';
import { Playlist } from './components/Playlist';
import { Effects } from './components/Effects';
import { SettingsModal } from './components/SettingsModal';
import { useDeck } from './hooks/useDeck';
import type { Track } from './types';
import { getAllTracksFromDB, saveTrackToDB } from './utils/storage';
import { useSettings } from './contexts/SettingsContext';
import { getKeyLabel } from './utils/keyHelpers';
import './App.css';

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [crossfader, setCrossfader] = useState(50);
  const [masterVolume, setMasterVolume] = useState(75);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { keyMap, layout } = useSettings();

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const deckAGainRef = useRef<GainNode | null>(null);
  const deckBGainRef = useRef<GainNode | null>(null);



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

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    masterGainRef.current = audioContextRef.current.createGain();
    masterGainRef.current.gain.value = masterVolume / 100;
    masterGainRef.current.connect(audioContextRef.current.destination);

    deckAGainRef.current = audioContextRef.current.createGain();
    deckAGainRef.current.connect(masterGainRef.current);

    deckBGainRef.current = audioContextRef.current.createGain();
    deckBGainRef.current.connect(masterGainRef.current);

    // setIsReady(true);

    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const { state: deckAState, controls: deckA } = useDeck({
    audioContext: audioContextRef.current!,
    destination: deckAGainRef.current!,
    deckId: 'A'
  });

  const { state: deckBState, controls: deckB } = useDeck({
    audioContext: audioContextRef.current!,
    destination: deckBGainRef.current!,
    deckId: 'B'
  });

  // Update crossfader
  useEffect(() => {
    if (deckAGainRef.current && deckBGainRef.current) {
      const deckAVolume = 1 - (crossfader / 100);
      const deckBVolume = crossfader / 100;

      deckAGainRef.current.gain.value = deckAVolume;
      deckBGainRef.current.gain.value = deckBVolume;
    }
  }, [crossfader]);

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

  const handleEffectChange = (
    deck: 'A' | 'B',
    effect: 'reverb' | 'delay' | 'filter',
    value: number
  ) => {
    if (deck === 'A') {
      deckA.setEffect(effect, value);
    } else {
      deckB.setEffect(effect, value);
    }
  };

  const handleImportTrack = async (track: Track, deckId: 'A' | 'B') => {
    let finalTrack = { ...track };
    const deck = deckId === 'A' ? deckA : deckB;

    // Show loading spinner on the deck immediately
    deck.setIsLoading(true);

    // If it's a YouTube track and doesn't have a file yet, we download it to store in DB
    if (!track.file && track.url.includes('localhost:3002/stream')) {
      try {
        console.log('Downloading track for persistence:', track.name);
        const res = await fetch(track.url);
        const blob = await res.blob();

        // Create a File object from the blob
        const file = new File([blob], `${track.name}.mp3`, { type: 'audio/mpeg' });

        finalTrack = {
          ...track,
          file: file,
          url: URL.createObjectURL(file) // Use local blob URL
        };

        // Save to IndexedDB
        await saveTrackToDB(finalTrack);
        console.log('Track saved to DB:', track.name);
      } catch (err) {
        console.error('Failed to persist track:', err);
      }
    }

    setTracks(prev => {
      if (prev.some(t => t.id === finalTrack.id)) {
        // Update existing track with the new file/url
        return prev.map(t => t.id === finalTrack.id ? finalTrack : t);
      }
      return [...prev, finalTrack];
    });

    handleLoadToDeck(finalTrack, deckId);
    // deck.loadTrack will handle setting isLoading to false when done
  };

  return (
    <div className="app">
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
          <button className="settings-btn" onClick={() => setIsSettingsOpen(true)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="app-main">
        <div className="decks-section">
          <Deck
            deckId="A"
            state={deckAState}
            onPlay={deckA.play}
            onPause={deckA.pause}
            onSeek={deckA.seek}
            onPitchChange={deckA.setPitch}
            onLoadTrack={(track) => handleImportTrack(track, 'A')}
            onToggleEffect={deckA.toggleEffect}
            onCue={deckA.handleCue}
            onDeleteCue={deckA.deleteCue}
            onLoopSet={deckA.setLoop}
            onLoopClear={deckA.clearLoop}
            color="#ff0080"
            shortcuts={{
              play: getKeyLabel(keyMap['DECK_A_PLAY'], layout),
              cue: getKeyLabel(keyMap['DECK_A_CUE'], layout),
              effect: getKeyLabel(keyMap['EFFECT_A_TOGGLE'], layout)
            }}
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
              shortcuts={{
                volumeA: { up: getKeyLabel(keyMap['VOLUME_A_UP'], layout), down: getKeyLabel(keyMap['VOLUME_A_DOWN'], layout) },
                volumeB: { up: getKeyLabel(keyMap['VOLUME_B_UP'], layout), down: getKeyLabel(keyMap['VOLUME_B_DOWN'], layout) },
                crossfader: { left: getKeyLabel(keyMap['CROSSFADER_LEFT'], layout), right: getKeyLabel(keyMap['CROSSFADER_RIGHT'], layout) }
              }}
            />
            <Effects onEffectChange={handleEffectChange} />
          </div>

          <Deck
            deckId="B"
            state={deckBState}
            onPlay={deckB.play}
            onPause={deckB.pause}
            onSeek={deckB.seek}
            onPitchChange={deckB.setPitch}
            onLoadTrack={(track) => handleImportTrack(track, 'B')}
            onToggleEffect={deckB.toggleEffect}
            onCue={deckB.handleCue}
            onDeleteCue={deckB.deleteCue}
            onLoopSet={deckB.setLoop}
            onLoopClear={deckB.clearLoop}
            color="#00d4ff"
            shortcuts={{
              play: getKeyLabel(keyMap['DECK_B_PLAY'], layout),
              cue: getKeyLabel(keyMap['DECK_B_CUE'], layout),
              effect: getKeyLabel(keyMap['EFFECT_B_TOGGLE'], layout)
            }}
          />
        </div>

        <Playlist
          tracks={tracks}
          onTracksChange={setTracks}
          onLoadToDeck={handleLoadToDeck}
        />
      </main>
    </div>
  );
}

export default App;
