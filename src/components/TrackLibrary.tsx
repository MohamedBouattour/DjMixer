import { useState, useCallback, useRef, useEffect } from 'react';
import type { Track } from '../types';
import { API_ENDPOINTS } from '../config';
import { loadAudioFile } from '../utils/audioUtils';

interface ShazamTrack {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  reason?: string;
  thumbnail?: string;
  duration?: number;
  shazamUrl?: string;
  source?: string;
}

interface SearchResult {
  id: string;
  title: string;
  duration: number;
  bpm?: number;
  artist?: string;
  author?: string;
  thumbnail?: string;
  genre?: string;
}

interface Props {
  queue: Track[];
  onAddToQueue: (track: Track) => void;
  onRemoveFromQueue: (trackId: string) => void;
  onClearQueue: () => void;
  tracks: Track[];
  onTracksChange: (tracks: Track[]) => void;
  onLoadTrack: (track: Track, deckId: 'A' | 'B') => void;
  onDeleteTrack?: (track: Track) => void;
  currentTrackName?: string;
  currentTrackArtist?: string;
  currentTrackId?: string;
  onApiCall: () => void;
  isPlayingA: boolean;
  isPlayingB: boolean;
  onOpenSettings: () => void;
}

const GENRES = ['house', 'techno', 'edm', 'dance', 'electronic', 'hip hop', 'pop', 'rock', 'rnb', 'latin'];

type Tab = 'queue' | 'library' | 'search' | 'recommendations';

export function TrackLibrary({
  queue,
  onAddToQueue,
  onRemoveFromQueue,
  onClearQueue,
  tracks,
  onTracksChange,
  onLoadTrack,
  onDeleteTrack,
  currentTrackName,
  currentTrackArtist,
  currentTrackId,
  onApiCall,
  isPlayingA,
  isPlayingB,
  onOpenSettings,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('queue');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: 'Queue' },
    { id: 'library', label: 'Library' },
    { id: 'search', label: 'Search' },
    { id: 'recommendations', label: 'Recs' },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[4999]" onClick={() => setIsOpen(false)} />
      )}

      <div className={`fixed bottom-0 left-0 right-0 z-[5000] transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-36px)]'}`}>
        {/* Collapsed bar — always visible */}
        <div
          className="h-9 px-3 flex items-center justify-between cursor-pointer bg-surface-container-low/90 backdrop-blur-xl border-t border-white/10"
          onClick={() => { const next = !isOpen; setIsOpen(next); if (next && activeTab === 'queue' && queue.length === 0) setActiveTab('recommendations'); }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-deck-a shrink-0">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
            <span className="text-[16px] font-semibold text-white font-display">Track Library</span>
            {queue.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-deck-a/20 text-deck-a rounded font-mono">{queue.length}</span>
            )}
            <span className="text-[11px] text-white/70 ml-1 capitalize font-mono">{activeTab}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={e => { e.stopPropagation(); onOpenSettings(); }}
              className="w-6 h-6 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all rounded hover:bg-white/10"
              title="Settings"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Expanded panel */}
        <div className={`bg-surface-container-low/95 backdrop-blur-xl border-t border-white/10 overflow-hidden transition-all ${isOpen ? 'h-[60vh]' : 'h-0'}`}>
          {/* Tab bar */}
          <div className="flex items-center border-b border-white/10 px-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2.5 text-[14px] font-bold uppercase tracking-wider transition-all relative font-display ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {tab.label}
                {tab.id === 'queue' && queue.length > 0 && (
                  <span className="ml-1 px-1 py-0.5 text-[7px] bg-deck-a/20 text-deck-a rounded font-mono">{queue.length}</span>
                )}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-deck-a to-deck-b rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="overflow-y-auto h-[calc(100%-45px)]">
            <div className="p-3 space-y-3">
              {activeTab === 'queue' && <QueueTabContent queue={queue} onRemoveFromQueue={onRemoveFromQueue} onClearQueue={onClearQueue} />}
              {activeTab === 'library' && <LibraryTabContent tracks={tracks} onTracksChange={onTracksChange} onLoadTrack={onLoadTrack} onDeleteTrack={onDeleteTrack} isPlayingA={isPlayingA} isPlayingB={isPlayingB} />}
              {activeTab === 'search' && <SearchTabContent onLoadTrack={onLoadTrack} onApiCall={onApiCall} isPlayingA={isPlayingA} isPlayingB={isPlayingB} />}
              {activeTab === 'recommendations' && <RecommendationsTabContent onAddToQueue={onAddToQueue} currentTrackName={currentTrackName} currentTrackArtist={currentTrackArtist} currentTrackId={currentTrackId} onApiCall={onApiCall} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Queue Tab ─── */
function QueueTabContent({ queue, onRemoveFromQueue, onClearQueue }: { queue: Track[]; onRemoveFromQueue: (id: string) => void; onClearQueue: () => void }) {
  if (queue.length === 0) {
    return <div className="text-center py-8 text-white/30 text-sm">Queue is empty. Add tracks from Library or Recommendations.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          {queue.length} track{queue.length !== 1 ? 's' : ''} in queue
        </span>
        <button onClick={onClearQueue} className="text-[9px] font-bold uppercase tracking-wider text-white/30 hover:text-accent-red transition-colors px-2 py-0.5 rounded hover:bg-white/5">
          Clear All
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {queue.map((track, index) => (
          <div key={track.id} className="flex items-center gap-2.5 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg group">
            <span className="text-[9px] font-bold text-white/30 w-4 shrink-0 text-right">{index + 1}.</span>
            <div className="w-8 h-8 rounded bg-white/5 overflow-hidden shrink-0">
              {track.thumbnail ? (
                <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full p-1.5 text-white/30">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-white/80 truncate">{track.name}</div>
              {track.artist && <div className="text-[9px] text-white/40 truncate">{track.artist}</div>}
            </div>
            <div className="text-[10px] font-mono text-white/30">{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}</div>
            <button
              onClick={() => onRemoveFromQueue(track.id)}
              className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/30 hover:bg-accent-red hover:text-white transition-all opacity-0 group-hover:opacity-100 shrink-0"
              title="Remove from queue"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Library Tab ─── */
function LibraryTabContent({
  tracks,
  onTracksChange,
  onLoadTrack,
  onDeleteTrack,
  isPlayingA,
  isPlayingB,
}: {
  tracks: Track[];
  onTracksChange: (tracks: Track[]) => void;
  onLoadTrack: (track: Track, deckId: 'A' | 'B') => void;
  onDeleteTrack?: (track: Track) => void;
  isPlayingA: boolean;
  isPlayingB: boolean;
}) {
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const newTracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;
      try {
        const audioData = await loadAudioFile(file);
        newTracks.push({
          id: `local-${Date.now()}-${i}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          duration: audioData.duration,
          url: URL.createObjectURL(file),
          file: file,
        });
      } catch (error) {
        console.error('Error loading file:', file.name, error);
      }
    }
    if (newTracks.length > 0) {
      onTracksChange([...newTracks, ...tracks]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  return (
    <div
      className={isDragActive ? 'border-2 border-dashed border-deck-b bg-deck-b/5 rounded-xl p-2' : ''}
      onDragOver={e => { e.preventDefault(); setIsDragActive(true); }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
    >
      <div className="flex gap-2 mb-3">
        <button
          className="flex-1 h-10 bg-white/10 border border-white/10 text-white/80 rounded-lg flex items-center justify-center gap-2 text-[11px] font-semibold hover:bg-white/20 transition-all"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Import Files
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" multiple onChange={e => handleFileUpload(e.target.files)} />
      </div>

      <div className="flex flex-col gap-1.5 max-h-[42vh] overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">No tracks in library. Import audio files or search YouTube.</div>
        ) : (
          tracks.map(track => (
            <div
              key={track.id}
              className="flex items-center gap-2.5 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg cursor-pointer hover:bg-white/[0.08] hover:border-white/20 transition-all group"
              onClick={() => setSelectedTrack(track)}
            >
              <div className="w-9 h-9 rounded bg-white/5 overflow-hidden shrink-0">
                {!track.file && !track.id.startsWith('local-') ? (
                  <img src={`https://i.ytimg.com/vi/${track.id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full p-1.5 text-white/30">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-white/80 truncate">{track.name}</div>
                <div className="text-[9px] text-white/40 truncate">{track.file ? 'Local File' : track.artist || 'YouTube'}</div>
              </div>
              <div className="text-[10px] font-mono text-white/30">{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}</div>
            </div>
          ))
        )}
      </div>

      {/* Deck selector popup */}
      {selectedTrack && (
        <div className="fixed inset-0 z-[6000] bg-black/80 flex items-center justify-center backdrop-blur-sm" onClick={() => setSelectedTrack(null)}>
          <div className="bg-[#222] p-5 rounded-xl text-center border border-white/10 w-[90%] max-w-[280px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-white truncate mb-1">{selectedTrack.name}</h3>
            <p className="text-[11px] text-white/50 mb-4">Load to which deck?</p>
            <div className="flex gap-3 mb-4">
              <button
                className="flex-1 h-20 rounded-lg font-extrabold text-2xl text-white flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 bg-deck-a"
                onClick={() => { onLoadTrack(selectedTrack, 'A'); setSelectedTrack(null); }}
              >
                A
                <span className="text-[9px] font-semibold opacity-70">{isPlayingA ? 'Playing' : 'Idle'}</span>
              </button>
              <button
                className="flex-1 h-20 rounded-lg font-extrabold text-2xl text-white flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 bg-deck-b"
                onClick={() => { onLoadTrack(selectedTrack, 'B'); setSelectedTrack(null); }}
              >
                B
                <span className="text-[9px] font-semibold opacity-70">{isPlayingB ? 'Playing' : 'Idle'}</span>
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {onDeleteTrack && !selectedTrack.id.startsWith('local-') && (
                <button
                  className="w-full py-2.5 bg-accent-red/10 border border-accent-red/20 text-accent-red rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                  onClick={() => { if (window.confirm('Remove this track from your library?')) { onDeleteTrack(selectedTrack); setSelectedTrack(null); } }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Track
                </button>
              )}
              <button className="w-full py-2.5 bg-transparent border border-white/10 text-white/50 rounded-lg text-[11px] font-medium hover:bg-white/5 transition-all" onClick={() => setSelectedTrack(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Search Tab (YouTube) ─── */
function SearchTabContent({
  onLoadTrack,
  onApiCall,
  isPlayingA,
  isPlayingB,
}: {
  onLoadTrack: (track: Track, deckId: 'A' | 'B') => void;
  onApiCall: () => void;
  isPlayingA: boolean;
  isPlayingB: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`);
      onApiCall();
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults((data || []).map((item: SearchResult) => ({
        id: item.id,
        name: item.title,
        duration: item.duration,
        url: `${API_ENDPOINTS.STREAM}?videoId=${item.id}`,
        bpm: item.bpm,
        artist: item.artist || item.author,
        thumbnail: item.thumbnail,
        genre: item.genre,
      })));
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div>
      <form className="flex gap-2 mb-3" onSubmit={handleSearch}>
        <input
          type="text"
          className="flex-1 h-10 bg-white/10 border border-white/10 rounded-lg px-3 text-[13px] text-white placeholder:text-white/30 focus:border-deck-b focus:outline-none"
          placeholder="Search YouTube..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={isSearching}
          className="h-10 px-4 bg-gradient-to-r from-deck-a to-deck-b rounded-lg text-white text-[11px] font-bold disabled:opacity-50 transition-all hover:brightness-110"
        >
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : 'Search'}
        </button>
      </form>

      <div className="flex flex-col gap-1.5 max-h-[42vh] overflow-y-auto">
        {results.length === 0 && !isSearching && (
          <div className="text-center py-8 text-white/30 text-sm">Search for tracks on YouTube</div>
        )}
        {isSearching && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-deck-a/30 border-t-deck-a animate-spin" />
          </div>
        )}
        {results.map(track => (
          <div
            key={track.id}
            className="flex items-center gap-2.5 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg cursor-pointer hover:bg-white/[0.08] hover:border-white/20 transition-all group"
            onClick={() => setSelectedTrack(track)}
          >
            <div className="w-9 h-9 rounded bg-white/5 overflow-hidden shrink-0">
              <img src={`https://i.ytimg.com/vi/${track.id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-white/80 truncate">{track.name}</div>
              <div className="text-[9px] text-white/40 truncate">{track.artist || 'YouTube'}</div>
            </div>
            <div className="text-[10px] font-mono text-white/30">{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}</div>
          </div>
        ))}
      </div>

      {/* Deck selector popup */}
      {selectedTrack && (
        <div className="fixed inset-0 z-[6000] bg-black/80 flex items-center justify-center backdrop-blur-sm" onClick={() => setSelectedTrack(null)}>
          <div className="bg-[#222] p-5 rounded-xl text-center border border-white/10 w-[90%] max-w-[280px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-white truncate mb-1">{selectedTrack.name}</h3>
            <p className="text-[11px] text-white/50 mb-4">Load to which deck?</p>
            <div className="flex gap-3 mb-4">
              <button
                className="flex-1 h-20 rounded-lg font-extrabold text-2xl text-white flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 bg-deck-a"
                onClick={() => { onLoadTrack(selectedTrack, 'A'); setSelectedTrack(null); }}
              >
                A
                <span className="text-[9px] font-semibold opacity-70">{isPlayingA ? 'Playing' : 'Idle'}</span>
              </button>
              <button
                className="flex-1 h-20 rounded-lg font-extrabold text-2xl text-white flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 bg-deck-b"
                onClick={() => { onLoadTrack(selectedTrack, 'B'); setSelectedTrack(null); }}
              >
                B
                <span className="text-[9px] font-semibold opacity-70">{isPlayingB ? 'Playing' : 'Idle'}</span>
              </button>
            </div>
            <button className="w-full py-2.5 bg-transparent border border-white/10 text-white/50 rounded-lg text-[11px] font-medium hover:bg-white/5 transition-all" onClick={() => setSelectedTrack(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Recommendations Tab ─── */
function RecommendationsTabContent({
  onAddToQueue,
  currentTrackName,
  currentTrackArtist,
  currentTrackId,
  onApiCall,
}: {
  onAddToQueue: (track: Track) => void;
  currentTrackName?: string;
  currentTrackArtist?: string;
  currentTrackId?: string;
  onApiCall: () => void;
}) {
  const [recommendations, setRecommendations] = useState<ShazamTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [error, setError] = useState('');

  const fetchRecommendations = useCallback(async (genre?: string) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (genre) params.set('genre', genre);
    if (currentTrackId) params.set('trackId', currentTrackId);
    if (currentTrackName) params.set('q', `${currentTrackArtist || ''} ${currentTrackName}`.trim());
    try {
      const res = await fetch(`${API_ENDPOINTS.RECOMMEND}?${params}`);
      onApiCall();
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, [currentTrackName, currentTrackArtist, currentTrackId, onApiCall]);

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre);
    fetchRecommendations(genre);
  };

  useEffect(() => {
    if (recommendations.length === 0) fetchRecommendations(selectedGenre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecommendations]);

  return (
    <div>
      {/* Now playing context */}
      {currentTrackName && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-white/5 rounded-lg border border-white/5 mb-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-deck-a to-deck-b flex items-center justify-center shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-white">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/40">Finding tracks similar to</div>
            <div className="text-[12px] font-semibold text-white truncate">{currentTrackName}</div>
          </div>
          {currentTrackArtist && <div className="text-[10px] text-white/40 truncate max-w-[100px]">{currentTrackArtist}</div>}
        </div>
      )}

      {/* Genre picker */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => handleGenreSelect('')}
          className={`px-2.5 py-1 text-[9px] font-semibold rounded-full transition-all ${!selectedGenre ? 'bg-deck-a/30 text-deck-a border border-deck-a/40' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'}`}
        >
          Random
        </button>
        {GENRES.map(g => (
          <button
            key={g}
            onClick={() => handleGenreSelect(g)}
            className={`px-2.5 py-1 text-[9px] font-semibold rounded-full transition-all capitalize ${selectedGenre === g ? 'bg-deck-a/30 text-deck-a border border-deck-a/40' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'}`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Refresh */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] uppercase tracking-widest text-white/30">
          {recommendations.length > 0 ? `Shazam • ${recommendations.length} tracks` : ''}
        </span>
        <button
          onClick={() => fetchRecommendations(selectedGenre)}
          disabled={loading}
          className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider bg-deck-a/20 border border-deck-a/30 text-deck-a rounded-lg hover:bg-deck-a/30 disabled:opacity-50 transition-all"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && <div className="text-[11px] text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mb-3">{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-deck-a/30 border-t-deck-a animate-spin" />
        </div>
      )}

      {/* Results */}
      {!loading && recommendations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {recommendations.map((track: ShazamTrack) => (
            <div key={track.id} className="rounded-xl overflow-hidden bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5 transition-all group">
              <div className="aspect-[16/9] bg-white/5 overflow-hidden relative">
                {track.thumbnail ? (
                  <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-deck-a/20 to-deck-b/20 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white/20">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  </div>
                )}
                {track.genre && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[7px] font-bold bg-black/60 backdrop-blur-sm rounded text-white/70 capitalize">
                    {track.genre}
                  </div>
                )}
                <div className="absolute top-1 right-1 px-1.5 py-0.5 text-[7px] font-bold bg-red-600/80 text-white rounded">YouTube</div>
              </div>
              <div className="p-2">
                <div className="text-[10px] font-semibold text-white/80 truncate" title={track.title}>{track.title}</div>
                <div className="text-[8px] text-white/40 truncate mb-1.5">{track.artist}</div>
                <button
                  onClick={() => onAddToQueue({ id: track.id, name: track.title, artist: track.artist, duration: track.duration || 180, thumbnail: track.thumbnail, url: `${API_ENDPOINTS.STREAM}?videoId=${track.id}` } as Track)}
                  className="w-full py-1 text-[8px] font-bold uppercase tracking-wider bg-gradient-to-r from-deck-a to-deck-b text-white rounded-lg hover:brightness-110 transition-all"
                >
                  Add to Queue
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && recommendations.length === 0 && !error && (
        <div className="text-center py-8 text-white/30 text-sm">
          Click a genre or Refresh to get Shazam recommendations
        </div>
      )}
    </div>
  );
}
