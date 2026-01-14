import React, { useState } from 'react';
import type { DeckState, Track } from '../types';
import { Waveform } from './Waveform';
import { YouTubeModal } from './YouTubeModal';
import { formatTime, formatTotalSeconds } from '../utils/helpers';
import './Deck.css';

interface DeckProps {
    deckId: 'A' | 'B';
    state: DeckState;
    onPlay: () => void;
    onPause: () => void;
    onSeek: (time: number) => void;
    onPitchChange: (pitch: number) => void;
    onLoadTrack?: (track: Track) => void;
    onToggleEffect: (effect: 'reverb' | 'delay' | 'filter' | 'distortion' | 'bitcrusher' | 'flanger' | 'tremolo' | 'hpf') => void;
    onCue: (index: number) => void;
    onDeleteCue: (index: number) => void;
    onLoopSet: (start: number, end: number) => void;
    onLoopClear: () => void;
    color: string;
}

export const Deck: React.FC<DeckProps> = ({
    deckId,
    state,
    onPlay,
    onPause,
    onSeek,
    onPitchChange,
    onLoadTrack,
    onToggleEffect,
    onCue,
    onDeleteCue,
    onLoopSet,
    onLoopClear,
    color
}) => {
    const [isYouTubeOpen, setIsYouTubeOpen] = useState(false);
    const { track, isPlaying, currentTime, pitch, activeEffects, cuePoints, activeLoop } = state;

    const loopStartRef = React.useRef<number>(0);
    const ignoreClickRef = React.useRef<boolean>(false);
    const [isHoldingLoop, setIsHoldingLoop] = useState(false);

    const handleLoopDown = () => {
        if (!track || !isPlaying) return;
        if (activeLoop?.active) return; // Allow re-looping only after clearing? Or handle clears in Click.

        loopStartRef.current = currentTime;
        setIsHoldingLoop(true);
        ignoreClickRef.current = false;
    };

    const handleLoopUp = () => {
        if (!isHoldingLoop) return;
        setIsHoldingLoop(false);

        // Calculate hold duration
        const loopDuration = currentTime - loopStartRef.current;

        // If held long enough (e.g. > 200ms), activate loop
        if (loopDuration > 0.2) {
            onLoopSet(loopStartRef.current, currentTime);
            ignoreClickRef.current = true; // Prevent the click from immediately clearing it if it fires after
        }
    };

    const handleLoopClick = () => {
        if (ignoreClickRef.current) {
            ignoreClickRef.current = false;
            return;
        }

        if (activeLoop?.active) {
            onLoopClear();
        }
    };

    const effectiveBPM = track?.bpm
        ? Math.round(track.bpm * (1 + pitch / 100))
        : null;

    return (
        <div className="deck glass-panel" style={{ '--deck-color': color } as React.CSSProperties}>
            <div className="deck-header">
                <div className="deck-header-left">
                    <YouTubeModal
                        deckId={deckId}
                        color={color}
                        isOpen={isYouTubeOpen}
                        onToggle={() => setIsYouTubeOpen(!isYouTubeOpen)}
                        onClose={() => setIsYouTubeOpen(false)}
                        onLoadTrack={onLoadTrack}
                    />
                    <div className="deck-label" style={{ background: color }}>
                        DECK {deckId}
                    </div>
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

            {state.isLoading ? (
                <div className="waveform-loading">
                    <div className="loading-spinner"></div>
                    <span>Downloading track...</span>
                </div>
            ) : track ? (
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

                    <div className="performance-controls">
                        <div className="effects-grid-performance">
                            <button
                                className={`btn-effect ${activeEffects?.reverb ? 'active' : ''}`}
                                onClick={() => onToggleEffect('reverb')}
                                title="Reverb"
                            >REV</button>
                            <button
                                className={`btn-effect ${activeEffects?.delay ? 'active' : ''}`}
                                onClick={() => onToggleEffect('delay')}
                                title="Delay"
                            >DLY</button>
                            <button
                                className={`btn-effect ${activeEffects?.filter ? 'active' : ''}`}
                                onClick={() => onToggleEffect('filter')}
                                title="Low Pass Filter"
                            >LPF</button>
                            <button
                                className={`btn-effect ${activeEffects?.hpf ? 'active' : ''}`}
                                onClick={() => onToggleEffect('hpf')}
                                title="High Pass Filter"
                            >HPF</button>
                            <button
                                className={`btn-effect ${activeEffects?.distortion ? 'active' : ''}`}
                                onClick={() => onToggleEffect('distortion')}
                                title="Distortion"
                            >DST</button>
                            <button
                                className={`btn-effect ${activeEffects?.bitcrusher ? 'active' : ''}`}
                                onClick={() => onToggleEffect('bitcrusher')}
                                title="Bitcrusher"
                            >BIT</button>
                            <button
                                className={`btn-effect ${activeEffects?.flanger ? 'active' : ''}`}
                                onClick={() => onToggleEffect('flanger')}
                                title="Flanger"
                            >FLG</button>
                            <button
                                className={`btn-effect ${activeEffects?.tremolo ? 'active' : ''}`}
                                onClick={() => onToggleEffect('tremolo')}
                                title="Tremolo"
                            >TRM</button>
                        </div>

                        <div className="cues-row">
                            {[0, 1].map(index => (
                                <button
                                    key={index}
                                    className={`btn-cue ${cuePoints[index] !== undefined ? 'active' : ''}`}
                                    onClick={(e) => {
                                        if (e.shiftKey) {
                                            onDeleteCue(index);
                                        } else {
                                            onCue(index);
                                        }
                                    }}
                                    title={cuePoints[index] !== undefined ? `Jump to ${formatTime(cuePoints[index])} (Shift+Click to clear)` : 'Set Cue'}
                                >
                                    {index + 1}
                                </button>
                            ))}
                        </div>

                        <div className="loop-control">
                            <button
                                className={`btn-magic-loop ${activeLoop?.active || isHoldingLoop ? 'active' : ''} ${isHoldingLoop ? 'holding' : ''}`}
                                onMouseDown={handleLoopDown}
                                onMouseUp={handleLoopUp}
                                onMouseLeave={handleLoopUp}
                                onClick={handleLoopClick}
                                onTouchStart={handleLoopDown}
                                onTouchEnd={handleLoopUp}
                                title="Hold to Magic Loop (Release to activate)"
                            >
                                <LoopIcon />
                                <span>MAGIC LOOP</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PlayIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const PauseIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
);


const LoopIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
    </svg>
);
