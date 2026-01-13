import React from 'react';
import type { DeckState } from '../types';
import { Waveform } from './Waveform';
import { formatTime, formatTotalSeconds } from '../utils/helpers';
import './Deck.css';

interface DeckProps {
    deckId: 'A' | 'B';
    state: DeckState;
    onPlay: () => void;
    onPause: () => void;
    onSeek: (time: number) => void;
    onPitchChange: (pitch: number) => void;
    onVolumeChange: (volume: number) => void;
    onEQChange: (band: 'low' | 'mid' | 'high', value: number) => void;
    color: string;
}

export const Deck: React.FC<DeckProps> = ({
    deckId,
    state,
    onPlay,
    onPause,
    onSeek,
    onPitchChange,
    onVolumeChange,
    onEQChange,
    color
}) => {
    const { track, isPlaying, currentTime, pitch, volume, eq } = state;

    const effectiveBPM = track?.bpm
        ? Math.round(track.bpm * (1 + pitch / 100))
        : null;

    return (
        <div className="deck glass-panel" style={{ '--deck-color': color } as React.CSSProperties}>
            <div className="deck-header">
                <div className="deck-label" style={{ background: color }}>
                    DECK {deckId}
                </div>
                {track && (
                    <div className="track-info">
                        <div className="track-name">{track.name}</div>
                        {effectiveBPM && (
                            <div className="bpm-display">
                                <span className="bpm-label">BPM</span>
                                <span className="bpm-value">{effectiveBPM}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {track ? (
                <Waveform
                    audioUrl={track.url}
                    currentTime={currentTime}
                    onSeek={onSeek}
                    isPlaying={isPlaying}
                    color={color}
                />
            ) : (
                <div className="waveform-placeholder">
                    <span>Load a track to begin</span>
                </div>
            )}

            <div className="deck-controls">
                <div className="deck-controls">
                    <div className="deck-transport">
                        <div className="playback-controls">
                            {isPlaying ? (
                                <button className="btn-play-pause active" onClick={onPause}>
                                    <PauseIcon />
                                </button>
                            ) : (
                                <button
                                    className="btn-play-pause"
                                    onClick={onPlay}
                                    disabled={!track}
                                >
                                    <PlayIcon />
                                </button>
                            )}

                            <div className="time-display">
                                <span className="current-time">{formatTime(currentTime)} <span className="text-xs opacity-50">({formatTotalSeconds(currentTime)})</span></span>
                                <span className="separator">/</span>
                                <span className="total-time">{formatTime(track?.duration || 0)}</span>
                            </div>
                        </div>

                        <div className="pitch-control">
                            <label className="control-label">
                                Pitch
                                <span className="pitch-value">{pitch > 0 ? '+' : ''}{pitch}%</span>
                            </label>
                            <input
                                type="range"
                                min="-10"
                                max="10"
                                step="0.1"
                                value={pitch}
                                onChange={(e) => onPitchChange(parseFloat(e.target.value))}
                                className="pitch-slider"
                            />
                        </div>
                    </div>

                    <div className="deck-mixer">
                        <div className="volume-control">
                            <label className="control-label">
                                Volume
                                <span className="volume-value">{Math.round(volume)}%</span>
                            </label>
                            <div className="volume-slider-container">
                                <input
                                    type="range"
                                    min="0"
                                    max="150"
                                    value={volume}
                                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                    className="volume-slider"
                                />
                            </div>
                        </div>

                        <div className="eq-controls">
                            <div className="eq-band">
                                <label className="control-label text-xs">LOW</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={eq.low}
                                    onChange={(e) => onEQChange('low', parseFloat(e.target.value))}
                                    className="eq-slider"
                                />
                            </div>
                            <div className="eq-band">
                                <label className="control-label text-xs">MID</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={eq.mid}
                                    onChange={(e) => onEQChange('mid', parseFloat(e.target.value))}
                                    className="eq-slider"
                                />
                            </div>
                            <div className="eq-band">
                                <label className="control-label text-xs">HIGH</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={eq.high}
                                    onChange={(e) => onEQChange('high', parseFloat(e.target.value))}
                                    className="eq-slider"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PlayIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const PauseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
);
