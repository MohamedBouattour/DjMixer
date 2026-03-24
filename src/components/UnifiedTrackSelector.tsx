import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Track } from '../types';
import { API_ENDPOINTS } from '../config';
import { loadAudioFile } from '../utils/audioUtils';

import './UnifiedTrackSelector.css';

interface UnifiedTrackSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    tracks: Track[];
    onTracksChange: (tracks: Track[]) => void;
    onLoadTrack: (track: Track, deckId: 'A' | 'B') => void;
    isPlayingA: boolean;
    isPlayingB: boolean;
}

export const UnifiedTrackSelector: React.FC<UnifiedTrackSelectorProps> = ({
    isOpen,
    onClose,
    tracks,
    onTracksChange,
    onLoadTrack,
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
            className="unified-track-item"
            onClick={() => setSelectedTrack(track)}
        >
            <div className="unified-track-thumb">
                <svg viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
            </div>
            <div className="unified-track-info">
                <div className="unified-track-title">{track.name}</div>
                <div className="unified-track-artist">
                    {track.file ? 'Local File' : 'YouTube Stream'}
                </div>
            </div>
            <div className="unified-track-duration">
                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
            </div>
        </div>
    );

    return ReactDOM.createPortal(
        <div className="unified-modal-overlay" onClick={onClose}>
            <div className="unified-modal" onClick={e => e.stopPropagation()}>
                <header className="unified-modal-header">
                    <div className="unified-tabs">
                        <button 
                            className={`unified-tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                            onClick={() => setActiveTab('library')}
                        >Library</button>
                        <button 
                            className={`unified-tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                            onClick={() => setActiveTab('search')}
                        >Search</button>
                    </div>
                    <button className="unified-close-btn" onClick={onClose}>&times;</button>
                </header>

                <div className="unified-content-area">
                    {activeTab === 'search' ? (
                        <div className="search-view">
                            <form className="search-input-container" onSubmit={handleSearch}>
                                <input 
                                    type="text" 
                                    className="main-search-input"
                                    placeholder="Search YouTube..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" className="search-btn" disabled={isSearching}>
                                    {isSearching ? '...' : 'Search'}
                                </button>
                            </form>
                            <div className="unified-track-list">
                                {searchResults.map(renderTrackItem)}
                            </div>
                        </div>
                    ) : (
                        <div 
                            className={`library-view ${isDragActive ? 'drag-active' : ''}`}
                            onDragOver={e => { e.preventDefault(); setIsDragActive(true); }}
                            onDragLeave={() => setIsDragActive(false)}
                            onDrop={handleDrop}
                        >
                            <div className="search-input-container">
                                <button 
                                    className="action-btn file-input-label" 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ width: '100%' }}
                                >
                                    Add Music Files
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept="audio/*"
                                    multiple
                                    onChange={e => handleFileUpload(e.target.files)}
                                />
                            </div>
                            <div className="unified-track-list">
                                {tracks.map(renderTrackItem)}
                            </div>
                        </div>
                    )}
                </div>

                {selectedTrack && (
                    <div className="selector-overlay" onClick={() => setSelectedTrack(null)}>
                        <div className="selector-card" onClick={e => e.stopPropagation()}>
                            <h3 className="unified-track-title">{selectedTrack.name}</h3>
                            <p style={{ color: '#888', marginBottom: '20px' }}>Load to which deck?</p>
                            <div className="selector-deck-buttons">
                                <button 
                                    className={`selector-deck-btn deck-a ${isPlayingA ? 'active' : ''}`}
                                    onClick={() => {
                                        onLoadTrack(selectedTrack, 'A');
                                        setSelectedTrack(null);
                                        onClose();
                                    }}
                                >
                                    A
                                    <span>{isPlayingA ? 'Currently Playing' : 'Idle'}</span>
                                </button>
                                <button 
                                    className={`selector-deck-btn deck-b ${isPlayingB ? 'active' : ''}`}
                                    onClick={() => {
                                        onLoadTrack(selectedTrack, 'B');
                                        setSelectedTrack(null);
                                        onClose();
                                    }}
                                >
                                    B
                                    <span>{isPlayingB ? 'Currently Playing' : 'Idle'}</span>
                                </button>
                            </div>
                            <button 
                                className="selector-cancel-btn"
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
