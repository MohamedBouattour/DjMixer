import React, { useRef } from 'react';
import type { Track } from '../types';
import { loadAudioFile } from '../utils/audioUtils';
import { formatTime } from '../utils/helpers';
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newTracks: Track[] = [];

        for (let i = 0; i < files.length; i++) {
            try {
                const track = await loadAudioFile(files[i]);
                newTracks.push(track);
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

        for (const file of files) {
            try {
                const track = await loadAudioFile(file);
                newTracks.push(track);
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

    const removeTrack = (trackId: string) => {
        onTracksChange(tracks.filter(t => t.id !== trackId));
    };

    return (
        <div className="playlist glass-panel">
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
