import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Track } from '../types';
import { API_ENDPOINTS } from '../config';
import { loadAudioFile } from '../utils/audioUtils';
import { cn } from '../utils/cn';
import { sharedStyles } from '../utils/sharedStyles';

interface UnifiedTrackSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    tracks: Track[];
    onTracksChange: (tracks: Track[]) => void;
    onLoadTrack: (track: Track, deckId: 'A' | 'B') => void;
    onDeleteTrack?: (track: Track) => void;
    isPlayingA: boolean;
    isPlayingB: boolean;
}

export const UnifiedTrackSelector: React.FC<UnifiedTrackSelectorProps> = ({
    isOpen,
    onClose,
    tracks,
    onTracksChange,
    onLoadTrack,
    onDeleteTrack,
    isPlayingA,
    isPlayingB
}) => {
    const [activeTab, setActiveTab] = useState<'library' | 'search'>('library');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Track[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        try {
            const response = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(searchQuery)}`);
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            setSearchResults(data.map((item: any) => ({
                id: item.id,
                name: item.title,
                duration: item.duration,
                url: `${API_ENDPOINTS.STREAM}?videoId=${item.id}`,
                bpm: item.bpm
            })));
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

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
                    file: file
                });
            } catch (error) {
                console.error('Error loading file:', file.name, error);
            }
        }

        if (newTracks.length > 0) {
            onTracksChange([...newTracks, ...tracks]);
            setActiveTab('library');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
        handleFileUpload(e.dataTransfer.files);
    };

    const renderTrackItem = (track: Track) => (
        <div 
            key={track.id} 
            className="group flex items-center gap-3 p-2 bg-bg-header border border-white/5 rounded-lg cursor-pointer transition-all duration-150 hover:bg-[#333] hover:border-white/10 relative"
            onClick={() => setSelectedTrack(track)}
        >
            <div className="w-[62px] h-[62px] bg-[#333] rounded overflow-hidden shrink-0 max-md:w-[52px] max-md:h-[52px]">
                <svg viewBox="0 0 24 24" fill="currentColor" opacity="0.5" className="w-full h-full p-2">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0 pr-10">
                <div className="text-[18px] font-semibold text-white truncate">{track.name}</div>
                <div className="text-[16px] text-text-hint truncate mt-0.5">
                    {track.file ? 'Local File' : 'YouTube Stream'}
                </div>
            </div>
            <div className="text-sm font-mono text-text-hint tabular-nums">
                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
            </div>
            {activeTab === 'library' && onDeleteTrack && (
                <button 
                    className="absolute right-2 w-[44px] h-[44px] flex items-center justify-center text-white/40 hover:text-accent-red hover:bg-accent-red/10 active:bg-accent-red/20 rounded-full transition-all md:opacity-0 md:group-hover:opacity-100 z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        if(window.confirm('Remove this track from your library?')) {
                            onDeleteTrack(track);
                        }
                    }}
                    title="Delete track"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            )}
        </div>
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[10000] flex items-center justify-center" onClick={onClose}>
            <div className={cn(sharedStyles.modalBase, "max-w-[95vw] max-h-[85vh] w-[600px] flex flex-col max-md:w-screen max-md:h-screen max-md:rounded-none max-md:max-h-none")} onClick={e => e.stopPropagation()}>
                <header className={cn(sharedStyles.modalHeader, "max-md:p-3")}>
                    <div className="flex gap-2">
                        <button 
                            className={cn(
                                "h-[42px] px-5 bg-bg-header border border-white/10 rounded-2xl text-[#888] text-[17px] font-semibold cursor-pointer transition-all duration-150",
                                activeTab === 'library' && "bg-gradient-to-br from-deck-a to-deck-b border-transparent text-white"
                            )}
                            onClick={() => setActiveTab('library')}
                        >Library</button>
                        <button 
                            className={cn(
                                "h-[42px] px-5 bg-bg-header border border-white/10 rounded-2xl text-[#888] text-[17px] font-semibold cursor-pointer transition-all duration-150",
                                activeTab === 'search' && "bg-gradient-to-br from-deck-a to-deck-b border-transparent text-white"
                            )}
                            onClick={() => setActiveTab('search')}
                        >Search</button>
                    </div>
                    <button className={cn(sharedStyles.iconBtnClose, "w-[42px] h-[42px]")} onClick={onClose}>&times;</button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 max-md:p-3">
                    {activeTab === 'search' ? (
                        <div className="flex flex-col">
                            <form className="flex gap-2 mb-4" onSubmit={handleSearch}>
                                <input 
                                    type="text" 
                                    className="flex-1 h-[57px] bg-bg-header border border-white/10 rounded-lg px-3.5 text-[18px] text-white focus:border-deck-b focus:outline-none"
                                    placeholder="Search YouTube..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" className="h-[57px] bg-deck-b border-none rounded-lg text-white flex items-center justify-center cursor-pointer px-4 font-semibold disabled:opacity-50" disabled={isSearching}>
                                    {isSearching ? '...' : 'Search'}
                                </button>
                            </form>
                            <div className="flex flex-col gap-2">
                                {searchResults.map(renderTrackItem)}
                            </div>
                        </div>
                    ) : (
                        <div 
                            className={cn(
                                "flex flex-col",
                                isDragActive && "border-2 border-dashed border-deck-b bg-deck-b/5"
                            )}
                            onDragOver={e => { e.preventDefault(); setIsDragActive(true); }}
                            onDragLeave={() => setIsDragActive(false)}
                            onDrop={handleDrop}
                        >
                            <div className="flex gap-2 mb-4">
                                <button 
                                    className="w-full h-[57px] bg-[#333] border border-white/10 text-[#ccc] rounded-lg flex items-center justify-center cursor-pointer px-4 font-semibold hover:bg-[#444] hover:text-white" 
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Add Music Files
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="audio/*"
                                    multiple
                                    onChange={e => handleFileUpload(e.target.files)}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                {tracks.map(renderTrackItem)}
                            </div>
                        </div>
                    )}
                </div>

                {selectedTrack && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-50" onClick={() => setSelectedTrack(null)}>
                        <div className="bg-[#222] p-6 rounded-xl text-center border border-white/10 w-[90%] max-w-[300px]" onClick={e => e.stopPropagation()}>
                            <h3 className="text-[18px] font-semibold text-white truncate mb-1">{selectedTrack.name}</h3>
                            <p className="text-text-hint mb-5">Load to which deck?</p>
                            <div className="flex gap-3 mb-5">
                                <button 
                                    className="flex-1 h-[104px] rounded-lg border-none font-extrabold text-[31px] text-white cursor-pointer flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 bg-deck-a"
                                    onClick={() => {
                                        onLoadTrack(selectedTrack, 'A');
                                        setSelectedTrack(null);
                                        onClose();
                                    }}
                                >
                                    A
                                    <span className="text-[10px] font-semibold opacity-80">{isPlayingA ? 'Currently Playing' : 'Idle'}</span>
                                </button>
                                <button 
                                    className="flex-1 h-[104px] rounded-lg border-none font-extrabold text-[31px] text-white cursor-pointer flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 bg-deck-b"
                                    onClick={() => {
                                        onLoadTrack(selectedTrack, 'B');
                                        setSelectedTrack(null);
                                        onClose();
                                    }}
                                >
                                    B
                                    <span className="text-[10px] font-semibold opacity-80">{isPlayingB ? 'Currently Playing' : 'Idle'}</span>
                                </button>
                            </div>
                            <button 
                                className="bg-transparent border border-[#444] text-[#888] py-2 px-4 rounded-[20px] cursor-pointer hover:border-[#666] hover:text-white"
                                onClick={() => setSelectedTrack(null)}
                            >Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
