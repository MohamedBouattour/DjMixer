import { useState, useEffect, useRef } from 'react';
import { Deck } from './components/Deck';
import { Mixer } from './components/Mixer';
import { Playlist } from './components/Playlist';
import { Effects } from './components/Effects';
import { useDeck } from './hooks/useDeck';
import type { Track } from './types';
import { getAllTracksFromDB, saveTrackToDB } from './utils/storage';
import './App.css';

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [crossfader, setCrossfader] = useState(50);
  const [masterVolume, setMasterVolume] = useState(75);

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
            onLoadTrack={(track) => handleImportTrack(track, 'A')}
            onToggleEffect={deckA.toggleEffect}
            onCue={deckA.handleCue}
            onDeleteCue={deckA.deleteCue}
            onLoopSet={deckA.setLoop}
            onLoopClear={deckA.clearLoop}
            color="#ff0080"
          />

          <div className="center-section">
            <Mixer
              crossfaderValue={crossfader}
              onCrossfaderChange={setCrossfader}
              masterVolume={masterVolume}
              onMasterVolumeChange={setMasterVolume}
              deckAState={deckA.state}
              deckBState={deckB.state}
              onVolumeChange={(deck, value) => deck === 'A' ? deckA.setVolume(value) : deckB.setVolume(value)}
              onEQChange={(deck, band, value) => deck === 'A' ? deckA.setEQ(band, value) : deckB.setEQ(band, value)}
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
            onLoadTrack={(track) => handleImportTrack(track, 'B')}
            onToggleEffect={deckB.toggleEffect}
            onCue={deckB.handleCue}
            onDeleteCue={deckB.deleteCue}
            onLoopSet={deckB.setLoop}
            onLoopClear={deckB.clearLoop}
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
