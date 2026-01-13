import { useState, useEffect, useRef } from 'react';
import { Deck } from './components/Deck';
import { Mixer } from './components/Mixer';
import { Playlist } from './components/Playlist';
import { Effects } from './components/Effects';
import { useDeck } from './hooks/useDeck';
import type { Track } from './types';
import './App.css';

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [crossfader, setCrossfader] = useState(50);
  const [masterVolume, setMasterVolume] = useState(75);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const deckAGainRef = useRef<GainNode | null>(null);
  const deckBGainRef = useRef<GainNode | null>(null);



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

  const deckA = useDeck({
    audioContext: audioContextRef.current!,
    destination: deckAGainRef.current!,
    deckId: 'A'
  });

  const deckB = useDeck({
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
        <div className="app-status">
          <div className="status-indicator"></div>
          <span>PWA Ready</span>
        </div>
      </header>

      <main className="app-main">
        <div className="decks-section">
          <Deck
            deckId="A"
            state={deckA.state}
            onPlay={deckA.play}
            onPause={deckA.pause}
            onSeek={deckA.seek}
            onPitchChange={deckA.setPitch}
            onVolumeChange={deckA.setVolume}
            onEQChange={deckA.setEQ}
            color="#ff0080"
          />

          <div className="center-section">
            <Mixer
              crossfaderValue={crossfader}
              onCrossfaderChange={setCrossfader}
              masterVolume={masterVolume}
              onMasterVolumeChange={setMasterVolume}
            />
            <Effects onEffectChange={handleEffectChange} />
          </div>

          <Deck
            deckId="B"
            state={deckB.state}
            onPlay={deckB.play}
            onPause={deckB.pause}
            onSeek={deckB.seek}
            onPitchChange={deckB.setPitch}
            onVolumeChange={deckB.setVolume}
            onEQChange={deckB.setEQ}
            color="#00d4ff"
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
