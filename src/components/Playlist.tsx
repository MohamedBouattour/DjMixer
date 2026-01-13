import React, { useRef, useEffect } from 'react';
import type { Track } from '../types';
import { loadAudioFile } from '../utils/audioUtils';
import { formatTime } from '../utils/helpers';
import { saveTrackToDB, deleteTrackFromDB } from '../utils/storage';
import './Playlist.css';

interface PlaylistProps {
    tracks: Track[];
    onTracksChange: (tracks: Track[]) => void;
    onLoadToDeck: (track: Track, deck: 'A' | 'B') => void;
}

export const Playlist: React.FC<PlaylistProps> = ({
    tracks,
    onTracksChange,
    onLoadToDeck
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const drawerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        // ... (existing logic)
        const files = e.target.files;
        if (!files) return;

        const newTracks: Track[] = [];

        const existingNames = new Set(tracks.map(t => t.name.toLowerCase()));

        for (let i = 0; i < files.length; i++) {
            const fileName = files[i].name.replace(/\.[^/.]+$/, '').toLowerCase();
            if (existingNames.has(fileName)) {
                console.warn(`Track "${files[i].name}" already exists in playlist.`);
                continue;
            }

            try {
                const track = await loadAudioFile(files[i]);
                await saveTrackToDB(track);
                newTracks.push(track);
                existingNames.add(track.name.toLowerCase());
            } catch (error) {
                console.error('Error loading file:', error);
            }
        }

        onTracksChange([...tracks, ...newTracks]);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const files = Array.from(e.dataTransfer.files).filter(file =>
            file.type.startsWith('audio/')
        );

        const newTracks: Track[] = [];

        const existingNames = new Set(tracks.map(t => t.name.toLowerCase()));

        for (const file of files) {
            const fileName = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
            if (existingNames.has(fileName)) {
                console.warn(`Track "${file.name}" already exists in playlist.`);
                continue;
            }

            try {
                const track = await loadAudioFile(file);
                await saveTrackToDB(track);
                newTracks.push(track);
                existingNames.add(track.name.toLowerCase());
            } catch (error) {
                console.error('Error loading file:', error);
            }
        }

        onTracksChange([...tracks, ...newTracks]);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const removeTrack = async (trackId: string) => {
        try {
            await deleteTrackFromDB(trackId);
            onTracksChange(tracks.filter(t => t.id !== trackId));
        } catch (error) {
            console.error('Error removing track:', error);
        }
    };

    return (
        <div ref={drawerRef} className={`playlist-drawer ${isOpen ? 'open' : ''}`}>
            <button
                className="playlist-handle"
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? "Close Playlist" : "Open Playlist"}
            >
                <span className="handle-text">PLAYLIST</span>
                <div className="handle-icon">
                    {isOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                </div>
            </button>

            <div className="playlist-content glass-panel">
                <div className="playlist-header">
                    <h3 className="playlist-title">Playlist</h3>
                    <button
                        className="btn-add-tracks"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <PlusIcon />
                        Add Tracks
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                </div>

                <div
                    className="track-list"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    {tracks.length === 0 ? (
                        <div className="empty-playlist">
                            <UploadIcon />
                            <p>Drop audio files here or click "Add Tracks"</p>
                            <p className="text-sm text-muted">Supports MP3, WAV, OGG, and more</p>
                        </div>
                    ) : (
                        tracks.map((track) => (
                            <div key={track.id} className="track-item">
                                <div className="track-details">
                                    <div className="track-name">{track.name}</div>
                                    <div className="track-meta">
                                        <span>{formatTime(track.duration)}</span>
                                        {track.bpm && <span className="track-bpm">{track.bpm} BPM</span>}
                                    </div>
                                </div>
                                <div className="track-actions">
                                    <button
                                        className="btn-load-deck deck-a"
                                        onClick={() => onLoadToDeck(track, 'A')}
                                        title="Load to Deck A"
                                    >
                                        A
                                    </button>
                                    <button
                                        className="btn-load-deck deck-b"
                                        onClick={() => onLoadToDeck(track, 'B')}
                                        title="Load to Deck B"
                                    >
                                        B
                                    </button>
                                    <button
                                        className="btn-remove"
                                        onClick={() => removeTrack(track.id)}
                                        title="Remove track"
                                    >
                                        <TrashIcon />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const PlusIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const UploadIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const ChevronLeftIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="15 18 9 12 15 6" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);
