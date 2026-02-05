import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Track } from '../types'; // Adjust import path
import { API_ENDPOINTS } from '../config';
import { loadAudioFile } from '../utils/audioUtils';
import { saveTrackToDB, deleteTrackFromDB } from '../utils/storage';
import { formatTime } from '../utils/helpers';
import './UnifiedTrackSelector.css';



interface UnifiedTrackSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadTrack: (track: Track, deckId: 'A' | 'B') => void;
    tracks: Track[];
    onTracksChange: (tracks: Track[]) => void;
    isPlayingA: boolean;
    isPlayingB: boolean;
}

type Tab = 'library' | 'youtube' | 'spotify';

export const UnifiedTrackSelector: React.FC<UnifiedTrackSelectorProps> = ({
    isOpen,
    onClose,
    onLoadTrack,
    tracks,
    onTracksChange,
    isPlayingA,
    isPlayingB
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('library');
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setSelectedTrack(null);
            setSearchResults([]);
            setSearchQuery('');
        }
    }, [isOpen]);

    const handleTrackSelect = (track: Track) => {
        setSelectedTrack(track);
    };

    const handleLoadToDeck = (deckId: 'A' | 'B') => {
        if (selectedTrack) {
            onLoadTrack(selectedTrack, deckId);
            onClose();
        }
    };

    const handleOnlineSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setSearchResults([]);

        try {
            const sourceParam = activeTab === 'spotify' ? '&source=spotify' : '';
            const res = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(searchQuery)}${sourceParam}`);
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            setSearchResults(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        await processFiles(Array.from(files));
    };

    const processFiles = async (files: File[]) => {
        const newTracks: Track[] = [];
        const existingNames = new Set(tracks.map(t => t.name.toLowerCase()));

        for (const file of files) {
            // Basic check to skip non-audio
            if (!file.type.startsWith('audio/')) continue;

            const fileName = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
            if (existingNames.has(fileName)) continue;

            try {
                const track = await loadAudioFile(file);
                await saveTrackToDB(track);
                newTracks.push(track);
            } catch (err) {
                console.error("Error loading file", err);
            }
        }
        if (newTracks.length > 0) {
            onTracksChange([...tracks, ...newTracks]);
        }
    };

    // Drag and drop handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = Array.from(e.dataTransfer.files);
        if (files && files.length > 0) {
            await processFiles(files);
        }
    };

    const handleDeleteTrack = async (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        if (window.confirm('Remove this track from library?')) {
            try {
                await deleteTrackFromDB(trackId);
                onTracksChange(tracks.filter(t => t.id !== trackId));
            } catch (err) {
                console.error("Failed to delete track", err);
            }
        }
    };

    // --- Content Renders ---

    const renderLibrary = () => {
        const filteredTracks = tracks.filter(t =>
            t.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
            <div
                className={`library-view ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <div className="search-input-container">
                    <input
                        type="text"
                        className="main-search-input"
                        placeholder="Filter library..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <label className="action-btn file-input-label">
                        <input
                            type="file"
                            hidden
                            multiple
                            accept="audio/*"
                            onChange={handleFileUpload}
                            ref={fileInputRef}
                        />
                        <span>Import Files</span>
                    </label>
                </div>

                <div className="track-list">
                    {filteredTracks.length === 0 ? (
                        <div className="empty-state">
                            <p>
                                {dragActive ? "Drop files to import!" : "No tracks found in library."}
                            </p>
                        </div>
                    ) : (
                        filteredTracks.map(track => (
                            <div key={track.id} className="track-list-item" onClick={() => handleTrackSelect(track)}>
                                <div className="track-thumb" style={{ background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    🎵
                                </div>
                                <div className="track-info-main">
                                    <div className="track-title-text">{track.name}</div>
                                    <div className="track-artist-text">{formatTime(track.duration)} • {track.bpm ? `${track.bpm} BPM` : 'BPM --'}</div>
                                </div>
                                <button
                                    className="delete-track-btn"
                                    onClick={(e) => handleDeleteTrack(e, track.id)}
                                    title="Remove from library"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'rgba(255,255,255,0.3)',
                                        fontSize: '18px',
                                        padding: '8px',
                                        cursor: 'pointer',
                                        marginLeft: '10px'
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4444')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                                >
                                    ✕
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderOnlineSearch = (source: 'YouTube' | 'Spotify') => (
        <div className="online-search-view">
            <form onSubmit={handleOnlineSearch} className="search-input-container">
                <input
                    type="text"
                    className="main-search-input"
                    placeholder={`Search ${source}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="action-btn" disabled={isSearching}>
                    {isSearching ? 'Searching...' : 'Search'}
                </button>
            </form>

            <div className="track-list">
                {searchResults.map(result => (
                    <div
                        key={result.id}
                        className="track-list-item"
                        onClick={() => handleTrackSelect({
                            id: result.id,
                            name: result.title,
                            duration: result.duration || 0,
                            url: `${API_ENDPOINTS.STREAM}?videoId=${result.id}`, // Build track object immediately
                            bpm: undefined
                        })}
                    >
                        <img src={result.thumbnail} alt="" className="track-thumb" />
                        <div className="track-info-main">
                            <div className="track-title-text">{result.title}</div>
                            <div className="track-artist-text">{result.author} • {result.timestamp}</div>
                        </div>
                    </div>
                ))}
                {searchResults.length === 0 && !isSearching && (
                    <div className="empty-state">
                        <p>Search for music on {source}</p>
                    </div>
                )}
            </div>
        </div>
    );

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="unified-modal-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="unified-modal">
                <div className="modal-header">
                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('library'); setSearchQuery(''); setSearchResults([]); }}
                        >
                            Library
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'youtube' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('youtube'); setSearchQuery(''); setSearchResults([]); }}
                        >
                            YouTube
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'spotify' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('spotify'); setSearchQuery(''); setSearchResults([]); }}
                        >
                            Spotify
                        </button>
                    </div>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="modal-content-area">
                    {activeTab === 'library' && renderLibrary()}
                    {activeTab === 'youtube' && renderOnlineSearch('YouTube')}
                    {activeTab === 'spotify' && renderOnlineSearch('Spotify')}
                </div>

                {selectedTrack && (
                    <div className="selection-overlay">
                        <div className="selection-card">
                            <div className="selected-track-preview">
                                <h3>{selectedTrack.name}</h3>
                                <p style={{ opacity: 0.7 }}>Select a deck to load this track</p>
                            </div>

                            <div className="deck-selection-buttons">
                                <button
                                    className={`deck-select-btn deck-a ${isPlayingA ? 'playing' : ''}`}
                                    onClick={() => handleLoadToDeck('A')}
                                >
                                    A
                                    <span>Deck A</span>
                                </button>
                                <button
                                    className={`deck-select-btn deck-b ${isPlayingB ? 'playing' : ''}`}
                                    onClick={() => handleLoadToDeck('B')}
                                >
                                    B
                                    <span>Deck B</span>
                                </button>
                            </div>

                            <button className="cancel-selection-btn" onClick={() => setSelectedTrack(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
