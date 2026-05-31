import { useState, useRef, useEffect } from 'react';
import type { Track, SmartSuggestion, SmartMixQueueItem, SmartMixPhase } from '../types';
import { API_ENDPOINTS } from '../config';

interface SmartMixPanelProps {
    isActive: boolean;
    phase: SmartMixPhase;
    statusText: string;
    suggestions: SmartSuggestion[];
    queue: SmartMixQueueItem[];
    queueIndex: number;
    isAiPowered: boolean;
    currentTrackName?: string;
    currentTrackArtist?: string;
    currentTrackBpm?: number;
    onToggle: () => void;
    onSelectSuggestion: (suggestion: SmartSuggestion) => void;
    onQueueAll: () => void;
    onAddToQueue: (suggestion: SmartSuggestion) => void;
    onRemoveFromQueue: (itemId: string) => void;
    onReorderQueue: (fromIndex: number, toIndex: number) => void;
    onRefreshSuggestions: () => void;
    onClearQueue: () => void;
    onTriggerTransition: () => void;
    onDoubleClickQueueItem?: (track: Track) => void;
    onAddTrackFromYt: (track: Track) => void;
}

const phaseColors: Record<SmartMixPhase, string> = {
    IDLE: 'bg-gray-800/50',
    FETCHING: 'bg-purple-900/40 border-purple-500/30',
    AWAITING_CHOICE: 'bg-indigo-900/40 border-indigo-500/30',
    LOADING: 'bg-blue-900/40 border-blue-500/30',
    LOOPING: 'bg-green-900/40 border-green-500/30',
    TRANSITIONING: 'bg-amber-900/40 border-amber-500/30',
    COOLDOWN: 'bg-gray-800/40 border-gray-500/20',
};

const phaseAccent: Record<SmartMixPhase, string> = {
    IDLE: 'from-gray-600 to-gray-700',
    FETCHING: 'from-purple-500 to-indigo-600',
    AWAITING_CHOICE: 'from-indigo-500 to-blue-600',
    LOADING: 'from-blue-500 to-cyan-600',
    LOOPING: 'from-green-500 to-emerald-600',
    TRANSITIONING: 'from-amber-500 to-orange-600',
    COOLDOWN: 'from-gray-500 to-slate-600',
};

export const SmartMixPanel = ({
    isActive,
    phase,
    statusText,
    suggestions,
    queue,
    queueIndex,
    isAiPowered,
    currentTrackName,
    currentTrackArtist,
    currentTrackBpm,
    onSelectSuggestion,
    onQueueAll,
    onAddToQueue,
    onRemoveFromQueue,
    onReorderQueue,
    onRefreshSuggestions,
    onClearQueue,
    onTriggerTransition,
    onDoubleClickQueueItem,
    onAddTrackFromYt,
}: SmartMixPanelProps) => {
    const [expanded, setExpanded] = useState(false);
    const [ytSearchQuery, setYtSearchQuery] = useState('');
    const [ytSearchResults, setYtSearchResults] = useState<Track[]>([]);
    const [isYtSearching, setIsYtSearching] = useState(false);

    // Close expanded panel on Escape key
    useEffect(() => {
        if (!expanded) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setExpanded(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [expanded]);

    const handleSearchYt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ytSearchQuery.trim()) return;
        setIsYtSearching(true);
        try {
            const response = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(ytSearchQuery)}`);
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            setYtSearchResults(data.map((item: { id: string; title: string; duration: number; artist?: string; author?: string; thumbnail?: string; genre?: string; bpm?: number }) => ({
                id: item.id,
                name: item.title,
                duration: item.duration,
                url: `${API_ENDPOINTS.STREAM}?videoId=${item.id}`,
                bpm: item.bpm,
                artist: item.artist || item.author,
                thumbnail: item.thumbnail,
                genre: item.genre,
            })));
        } catch (error) {
            console.error('YT search error:', error);
        } finally {
            setIsYtSearching(false);
        }
    };

    const handleAddYtTrackToQueue = (track: Track) => {
        onAddTrackFromYt(track);
        setYtSearchResults([]);
        setYtSearchQuery('');
    };
    const dragItemRef = useRef<number | null>(null);
    const dragOverRef = useRef<number | null>(null);

    const handleDragStart = (index: number) => {
        dragItemRef.current = index;
    };

    const handleDragOver = (index: number) => {
        dragOverRef.current = index;
    };

    const handleDrop = () => {
        const from = dragItemRef.current;
        const to = dragOverRef.current;
        if (from !== null && to !== null && from !== to) {
            onReorderQueue(from, to);
        }
        dragItemRef.current = null;
        dragOverRef.current = null;
    };

    const suggestionsFound = suggestions.filter(s => s.status === 'found');

    return (
        <>
            {/* Backdrop overlay to close panel when clicking outside */}
            {expanded && isActive && (
                <div
                    className="fixed inset-0 z-[4999]"
                    onClick={() => setExpanded(false)}
                />
            )}
            <div
                className={`fixed bottom-0 left-0 right-0 z-[5000] transition-all duration-300 ease-in-out ${
                    isActive ? 'translate-y-0' : 'translate-y-full'
                }`}
            >
            {/* Collapsed bar */}
            <div
                className={`h-12 px-4 flex items-center justify-between cursor-pointer border-t border-white/10 backdrop-blur-xl transition-all ${
                    expanded ? 'hidden' : phaseColors[phase]
                }`}
                onClick={() => setExpanded(true)}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${phaseAccent[phase]} animate-pulse`} />
                    <span className="text-sm font-semibold text-white/90">{statusText || 'Smart Mix'}</span>
                    {isAiPowered && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-600 to-indigo-600 rounded text-white/90">
                            AI
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {queue.length > 0 && (
                        <span className="text-xs text-white/60">
                            <span className="font-bold text-white/90">{queue.length - queueIndex}</span> left
                        </span>
                    )}
                    {phase === 'LOOPING' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onTriggerTransition(); }}
                            className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded hover:bg-amber-500/30 transition-all"
                        >
                            Mix Now
                        </button>
                    )}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                        <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                    </svg>
                </div>
            </div>

            {/* Expanded panel */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden backdrop-blur-xl border-t border-white/10 ${
                    expanded ? 'max-h-[70vh]' : 'max-h-0'
                } ${phaseColors[phase]}`}
            >
                <div className="max-h-[70vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${phaseAccent[phase]} ${phase === 'FETCHING' ? 'animate-spin' : ''}`} />
                            <span className="text-sm font-bold text-white">{statusText || 'Smart Mix'}</span>
                            {isAiPowered && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-600 to-indigo-600 rounded text-white/90">
                            AI
                        </span>
                    )}
                            {phase === 'FETCHING' && (
                                <span className="flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {queue.length > 0 && (
                                <button
                                    onClick={onClearQueue}
                                    className="px-2 py-1 text-[9px] uppercase tracking-wider text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded transition-all"
                                >
                                    Clear Queue
                                </button>
                            )}
                            <button
                                onClick={() => setExpanded(false)}
                                className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 15l7-7 7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Now Playing */}
                    {currentTrackName && (
                        <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Now Playing</div>
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-8 rounded-full bg-gradient-to-b from-deck-a to-deck-b" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">{currentTrackName}</div>
                                    {currentTrackArtist && (
                                        <div className="text-xs text-white/50 truncate">{currentTrackArtist}</div>
                                    )}
                                </div>
                                {currentTrackBpm && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-white/5 border border-white/10 rounded text-white/60">
                                        {Math.round(currentTrackBpm)} BPM
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* YouTube Search Bar */}
                    <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01]">
                        <form onSubmit={handleSearchYt} className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    placeholder="Search YouTube to add to queue..."
                                    value={ytSearchQuery}
                                    onChange={(e) => setYtSearchQuery(e.target.value)}
                                    className="w-full h-8 bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all"
                                />
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"
                                >
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.3-4.3" />
                                </svg>
                            </div>
                            <button
                                type="submit"
                                disabled={isYtSearching}
                                className="px-3 h-8 text-[10px] font-bold uppercase tracking-wider bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-lg hover:bg-indigo-600/30 disabled:opacity-50 transition-all shrink-0"
                            >
                                {isYtSearching ? '...' : 'Search'}
                            </button>
                        </form>

                        {/* Search Results */}
                        {ytSearchResults.length > 0 && (
                            <div className="mt-2.5 space-y-1 max-h-[150px] overflow-y-auto bg-black/40 p-2 rounded-lg border border-white/5">
                                <div className="flex justify-between items-center px-1 mb-1">
                                    <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Search Results</span>
                                    <button
                                        onClick={() => setYtSearchResults([])}
                                        className="text-[8px] uppercase tracking-wider text-red-400 hover:text-red-300"
                                    >
                                        Close
                                    </button>
                                </div>
                                {ytSearchResults.map((track) => (
                                    <div
                                        key={track.id}
                                        className="flex items-center justify-between p-1.5 rounded-md hover:bg-white/5 transition-all cursor-pointer"
                                        onClick={() => handleAddYtTrackToQueue(track)}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                            {track.thumbnail ? (
                                                <img
                                                    src={track.thumbnail}
                                                    alt=""
                                                    className="w-10 h-6 object-cover rounded bg-white/5 shrink-0"
                                                />
                                            ) : (
                                                <div className="w-10 h-6 rounded bg-white/5 shrink-0 flex items-center justify-center">
                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-white/20">
                                                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                                    </svg>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-semibold text-white/80 truncate">{track.name}</div>
                                                <div className="text-[9px] text-white/40 truncate">{track.artist || 'Unknown Artist'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[8px] font-mono text-white/40">
                                                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                                            </span>
                                            <button
                                                className="px-1.5 py-0.5 text-[8px] font-bold bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded hover:bg-indigo-500/30 transition-all"
                                            >
                                                + Queue
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Queue section */}
                    {queue.length > 0 && (
                        <div className="px-4 py-3 border-b border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] uppercase tracking-widest text-white/30">
                                    Up Next
                                    <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-white/5 rounded text-white/40">{queue.length - queueIndex}</span>
                                </span>
                            </div>
                            <div className="space-y-1 max-h-[180px] overflow-y-auto">
                                {queue.slice(queueIndex).map((item, index) => (
                                    <div
                                        key={item.id}
                                        draggable
                                        onDragStart={() => handleDragStart(queueIndex + index)}
                                        onDragOver={(e) => { e.preventDefault(); handleDragOver(queueIndex + index); }}
                                        onDrop={handleDrop}
                                        onDoubleClick={() => onDoubleClickQueueItem?.(item.track)}
                                        title="Double-click to load this track to the free deck"
                                        className={`flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all cursor-grab active:cursor-grabbing ${
                                            index === 0 && phase !== 'TRANSITIONING'
                                                ? 'bg-white/8 border border-white/10'
                                                : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <span className="text-[10px] font-mono text-white/20 w-4 text-right shrink-0">{queueIndex + index + 1}</span>
                                        {item.track.thumbnail ? (
                                            <img
                                                src={item.track.thumbnail}
                                                alt=""
                                                className="w-8 h-8 rounded object-cover shrink-0 bg-white/5"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded bg-gradient-to-br from-deck-a/30 to-deck-b/30 shrink-0 flex items-center justify-center">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-white/30">
                                                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-white/80 truncate">{item.track.name}</div>
                                            <div className="text-[10px] text-white/40 truncate">{item.track.artist || 'Unknown Artist'}</div>
                                        </div>
                                        {item.track.bpm && (
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-white/5 rounded text-white/40 shrink-0">
                                                {Math.round(item.track.bpm)}
                                            </span>
                                        )}
                                        <button
                                            onClick={() => onRemoveFromQueue(item.id)}
                                            className="w-5 h-5 rounded-full bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/30 hover:text-red-400 transition-all shrink-0"
                                        >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6L6 18M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Suggestions section */}
                    {phase === 'AWAITING_CHOICE' && suggestions.length > 0 && (
                        <div className="px-4 py-3">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[9px] uppercase tracking-widest text-white/30">
                                    AI Suggestions
                                    <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-white/5 rounded text-white/40">{suggestions.length}</span>
                                </span>
                                <div className="flex items-center gap-2">
                                    {suggestionsFound.length > 1 && (
                                        <button
                                            onClick={onQueueAll}
                                            className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded hover:bg-indigo-500/30 transition-all"
                                        >
                                            Queue All
                                        </button>
                                    )}
                                    <button
                                        onClick={onRefreshSuggestions}
                                        className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/50 rounded hover:bg-white/10 hover:text-white/70 transition-all"
                                    >
                                        Refresh
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                                {suggestions.map((s) => (
                                    <SuggestionCard
                                        key={s.id}
                                        suggestion={s}
                                        onSelect={onSelectSuggestion}
                                        onAddToQueue={onAddToQueue}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* FETCHING state */}
                    {phase === 'FETCHING' && (
                        <div className="px-4 py-8 flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
                            <span className="text-sm text-white/50">Asking AI for the perfect next track...</span>
                        </div>
                    )}

                    {/* AWAITING_CHOICE with no suggestions */}
                    {phase === 'AWAITING_CHOICE' && suggestions.length === 0 && (
                        <div className="px-4 py-6 flex flex-col items-center justify-center gap-3">
                            <span className="text-sm text-white/40">No suggestions available</span>
                            <button
                                onClick={onRefreshSuggestions}
                                className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-lg hover:bg-indigo-500/30 transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* LOOPING / LOADING state */}
                    {(phase === 'LOOPING' || phase === 'LOADING' || phase === 'TRANSITIONING' || phase === 'COOLDOWN') && (
                        <div className="px-4 py-3 flex items-center justify-between">
                            <span className="text-xs text-white/40">
                                {phase === 'LOOPING' ? 'Track loaded, waiting for transition...' :
                                 phase === 'LOADING' ? 'Loading next track...' :
                                 phase === 'TRANSITIONING' ? 'Mixing tracks...' :
                                 'Preparing next...'}
                            </span>
                            {phase === 'LOOPING' && (
                                <button
                                    onClick={onTriggerTransition}
                                    className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:brightness-110 transition-all shadow-[0_0_15px_rgba(251,146,60,0.3)]"
                                >
                                    Mix Now
                                </button>
                            )}
                            {phase === 'TRANSITIONING' && (
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom padding */}
                    <div className="h-2" />
                </div>
            </div>
            </div>
        </>
    );
};

// ─── Suggestion Card ──────────────────────────────────────────────────────
interface SuggestionCardProps {
    suggestion: SmartSuggestion;
    onSelect: (s: SmartSuggestion) => void;
    onAddToQueue: (s: SmartSuggestion) => void;
}

const SuggestionCard = ({ suggestion: s, onSelect, onAddToQueue }: SuggestionCardProps) => {
    const isFound = s.status === 'found';

    return (
        <div
            className={`relative rounded-xl overflow-hidden transition-all duration-200 group ${
                isFound
                    ? s.isDiverse
                        ? 'bg-purple-950/[0.1] border border-purple-500/30 hover:bg-purple-950/[0.15] hover:border-purple-500/50 hover:-translate-y-0.5 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
                        : 'bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5'
                    : 'bg-white/[0.02] border border-white/5 opacity-50'
            }`}
        >
            {/* Thumbnail */}
            <div className="relative aspect-[16/9] bg-white/5 overflow-hidden">
                {s.thumbnail && isFound ? (
                    <img
                        src={s.thumbnail}
                        alt={s.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-deck-a/20 to-deck-b/20 flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white/20">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                    </div>
                )}
                {/* Status badge */}
                {!isFound && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-red-500/30 border border-red-500/40 text-red-300 rounded">
                            Not Found
                        </span>
                    </div>
                )}
                {/* BPM badge */}
                {s.bpm && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[8px] font-bold bg-black/60 backdrop-blur-sm rounded text-white/70">
                        {Math.round(s.bpm)} BPM
                    </div>
                )}
                {/* Genre badge */}
                {s.genre && (
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[8px] font-bold bg-black/60 backdrop-blur-sm rounded text-white/70">
                        {s.genre}
                    </div>
                )}
                {/* Diverse Choice badge */}
                {s.isDiverse && (
                    <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[8px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 rounded text-white shadow-[0_0_10px_rgba(236,72,153,0.5)] z-10">
                        Diverse Choice
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-2.5">
                <div className="text-[11px] font-semibold text-white/80 truncate leading-tight mb-0.5" title={s.title}>
                    {s.title}
                </div>
                <div className="text-[9px] text-white/40 truncate mb-1.5" title={s.artist}>
                    {s.artist}
                </div>
                <div className="text-[8px] text-white/30 italic leading-tight line-clamp-2 mb-2 min-h-[2em]">
                    {s.reason}
                </div>

                {/* Actions */}
                {isFound && (
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => onSelect(s)}
                            className="flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-deck-a to-deck-b/80 text-white rounded-lg hover:brightness-110 transition-all shadow-[0_0_10px_rgba(255,0,128,0.2)]"
                        >
                            Play Next
                        </button>
                        <button
                            onClick={() => onAddToQueue(s)}
                            className="py-1.5 px-2 text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/50 rounded-lg hover:bg-white/10 hover:text-white/70 transition-all"
                            title="Add to end of queue"
                        >
                            +Q
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
