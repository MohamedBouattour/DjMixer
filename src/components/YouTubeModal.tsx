import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Track } from '../types';
import './YouTubeModal.css';

interface YouTubeModalProps {
    deckId: 'A' | 'B';
    color: string;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    onLoadTrack?: (track: Track) => void;
}



export const YouTubeModal: React.FC<YouTubeModalProps> = ({
    deckId,
    color,
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
                if (!target.closest('.youtube-trigger-btn')) {
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
            const res = await fetch(`/search?q=${encodeURIComponent(searchQuery)}`);
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
                url: `/stream?videoId=${id}`,
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
        <div className="youtube-modal-overlay">
            <div
                ref={modalRef}
                className="youtube-modal open"
                style={{ '--modal-accent': color } as React.CSSProperties}
            >
                <div className="youtube-modal-header">
                    <div className="modal-title">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#ff0000">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                        <span>YouTube - Deck {deckId}</span>
                    </div>
                    <div className="modal-controls">
                        {currentVideoId && (
                            <button
                                className="modal-btn clear-btn"
                                onClick={handleClear}
                                title="Clear video"
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

                <div className="youtube-input-section">
                    <form onSubmit={handleInternalSearch} className="search-form">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search songs on YouTube..."
                            className="youtube-search-input"
                        />
                        <button type="submit" className="search-btn" disabled={!searchQuery.trim() || isSearching}>
                            {isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </form>
                    {errorMessage && (
                        <div className="error-message" style={{ color: 'red', marginTop: '8px', fontSize: '0.9em' }}>
                            {errorMessage}
                        </div>
                    )}
                </div>

                <div className="youtube-modal-content">
                    {/* Search Results Overlay */}
                    {searchResults.length > 0 ? (
                        <div className="search-results-list">
                            <div className="results-header">
                                <span>Found {searchResults.length} videos</span>
                                <button className="close-results" onClick={() => setSearchResults([])}>✕</button>
                            </div>
                            {searchResults.map(video => (
                                <div key={video.id} className="search-result-item" onClick={() => setCurrentVideoId(video.id)}>
                                    <img src={video.thumbnail} alt={video.title} className="result-thumb" />
                                    <div className="result-info">
                                        <div className="result-title">{video.title}</div>
                                        <div className="result-meta">
                                            {video.author} • {video.timestamp}
                                        </div>
                                    </div>
                                    {onLoadTrack && (
                                        <button
                                            className="result-add-btn"
                                            style={{ background: color }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddToDeck(video.id, video.title, video.duration);
                                            }}
                                        >
                                            Load
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {currentVideoId ? (
                        <iframe
                            src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1`}
                            className="youtube-iframe"
                            title={`YouTube for Deck ${deckId}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        />
                    ) : (
                        <div className="youtube-placeholder">
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="#ff0000" opacity="0.5">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                            <p>Paste a URL or Search for a song</p>
                        </div>
                    )}
                </div>

                <div className="youtube-modal-footer">
                    <p className="youtube-hint">
                        🎵 Backend Proxy enabled: Direct mp3 streaming available
                    </p>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            {/* Red Triangle Trigger Button */}
            <button
                className="youtube-trigger-btn"
                onClick={onToggle}
                title={`Open YouTube for Deck ${deckId}`}
                style={{ '--btn-color': color } as React.CSSProperties}
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="#ff0000"
                    className="youtube-icon"
                >
                    <path d="M4 4l16 8-16 8V4z" />
                </svg>
                <span className="youtube-badge">YT</span>
            </button>

            {/* Render modal using Portal to document.body */}
            {ReactDOM.createPortal(modalContent, document.body)}
        </>
    );
};
