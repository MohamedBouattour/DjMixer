import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Track } from '../types';
import { API_ENDPOINTS } from '../config';
import './SpotifyModal.css';

interface SpotifyModalProps {
    deckId: 'A' | 'B';
    color: string;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    onLoadTrack?: (track: Track) => void;
}

export const SpotifyModal: React.FC<SpotifyModalProps> = ({
    deckId,
    isOpen,
    onToggle,
    onClose,
    onLoadTrack
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Handle click outside to minimize
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && modalRef.current && !modalRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (!target.closest('.spotify-trigger-btn')) {
                    onClose();
                }
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    const handleInternalSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setErrorMessage('');
        try {
            // We pass source=spotify to tell the backend to use play-dl for better results/stability
            const res = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(searchQuery)}&source=spotify`);
            if (!res.ok) throw new Error('Backend not reachable');
            const data = await res.json();
            setSearchResults(data);
        } catch (err) {
            console.error(err);
            setErrorMessage('Search failed. Is the backend proxy running on port 3002?');
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddToDeck = (id: string, title: string, duration?: number) => {
        if (onLoadTrack) {
            onLoadTrack({
                id: id,
                name: title,
                duration: duration || 0,
                url: `${API_ENDPOINTS.STREAM}?videoId=${id}`,
                bpm: undefined
            });
            onClose();
        }
    };

    const handleClear = () => {
        setCurrentVideoId(null);
        setErrorMessage('');
    };

    const modalContent = isOpen ? (
        <div className="spotify-modal-overlay">
            <div
                ref={modalRef}
                className="spotify-modal open"
            >
                <div className="spotify-modal-header">
                    <div className="spotify-modal-title">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#1DB954">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.38 9.841-.719 13.44 1.56.421.24.6.84.301 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        <span>Spotify • Deck {deckId}</span>
                    </div>
                    <div className="modal-controls">
                        {currentVideoId && (
                            <button
                                className="modal-btn clear-btn"
                                onClick={handleClear}
                                title="Clear track"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                </svg>
                            </button>
                        )}
                        <button
                            className="modal-btn minimize-btn"
                            onClick={onClose}
                            title="Minimize"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 13H5v-2h14v2z" />
                            </svg>
                        </button>
                    </div>
                </div>
                {/* Search Interface - login flow hidden */}
                <>
                    <div className="spotify-input-section">
                        <form onSubmit={handleInternalSearch} className="search-form">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search song or paste Spotify URL"
                                className="spotify-search-input"
                            />
                            <button type="submit" className="spotify-search-btn" disabled={!searchQuery.trim() || isSearching}>
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                        </form>
                        {errorMessage && (
                            <div className="error-message">
                                {errorMessage}
                            </div>
                        )}
                    </div>

                    <div className="spotify-modal-content">
                        {/* Search Results Overlay */}
                        {searchResults.length > 0 ? (
                            <div className="search-results-list">
                                <div className="results-header">
                                    <span>Top Results</span>
                                    <button className="close-results" onClick={() => setSearchResults([])}>✕</button>
                                </div>
                                {searchResults.map(video => (
                                    <div key={video.id} className="search-result-item" onClick={() => setCurrentVideoId(video.id)}>
                                        <img src={video.thumbnail} alt={video.title} className="result-thumb" />
                                        <div className="result-info">
                                            <div className="result-title">{video.title}</div>
                                            <div className="result-meta">
                                                Song • {video.author} • {video.timestamp}
                                            </div>
                                        </div>
                                        {onLoadTrack && (
                                            <button
                                                className="result-add-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddToDeck(video.id, video.title, video.duration);
                                                }}
                                            >
                                                Add to Deck
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {currentVideoId ? (
                            <iframe
                                src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1`}
                                className="spotify-iframe"
                                title={`Spotify for Deck ${deckId}`}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            />
                        ) : (
                            <div className="spotify-placeholder">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="#1DB954" opacity="0.5">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.38 9.841-.719 13.44 1.56.421.24.6.84.301 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                                <p>Search for a song</p>
                            </div>
                        )}
                    </div>

                    <div className="spotify-modal-footer">
                        <p className="spotify-hint">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" /></svg>
                            Results powered by Open Source Streaming
                        </p>
                    </div>
                </>
            </div>
        </div>
    ) : null;

    return (
        <>
            <button
                className="spotify-trigger-btn"
                onClick={onToggle}
                title={`Open Spotify for Deck ${deckId}`}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="#1DB954"
                    className="spotify-icon"
                >
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.38 9.841-.719 13.44 1.56.421.24.6.84.301 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
            </button>

            {ReactDOM.createPortal(modalContent, document.body)}
        </>
    );
};
