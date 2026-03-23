import React, { useState, useRef, useEffect } from 'react';
import type { DeckState } from '../types';
import { Waveform } from './Waveform';
import { ScrollableWaveform } from './ScrollableWaveform';
import VerticalSlider from './VerticalSlider';
import { TimeDisplay } from './TimeDisplay';
import { formatTime } from '../utils/helpers';
import './Deck.css';

interface DeckProps {
    deckId: 'A' | 'B';
    state: DeckState;
    onPlay: () => void;
    onPause: () => void;
    onSeek: (time: number) => void;
    onPitchChange: (pitch: number) => void;

    onToggleEffect: (effect: 'reverb' | 'delay' | 'filter' | 'distortion' | 'bitcrusher' | 'flanger' | 'tremolo' | 'hpf') => void;
    onCue: (index: number) => void;
    onDeleteCue: (index: number) => void;
    onLoopSet: (start: number, end: number) => void;
    onLoopClear: () => void;

    // Scratching
    onScratch?: (velocity: number) => void;
    onReleaseScratch?: () => void;

    color: string;
    shortcuts?: {
        play?: string;
        cue?: string;
        effect?: string;
    };
}

export const Deck: React.FC<DeckProps> = ({
    deckId,
    state,
    onPlay,
    onPause,
    onSeek,
    onPitchChange,

    onToggleEffect,
    onCue,
    onDeleteCue,
    onLoopSet,
    onLoopClear,

    onScratch,
    onReleaseScratch,

    color,
    shortcuts
}) => {

    const { track, isPlaying, currentTime, pitch, activeEffects, cuePoints, activeLoop } = state;
    const [showEffects, setShowEffects] = useState(false);

    const loopStartRef = useRef<number>(0);
    const ignoreClickRef = useRef<boolean>(false);
    const [isHoldingLoop, setIsHoldingLoop] = useState(false);

    // Close FX popup on click outside (handled via backdrop usually, or simple event listener)
    useEffect(() => {
        if (showEffects) {
            const handleClickOutside = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (!target.closest('.deck-effects-popup') && !target.closest('.deck-btn-fx-toggle')) {
                    setShowEffects(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showEffects]);

    const handleLoopDown = () => {
        if (!track || !isPlaying) return;
        if (activeLoop?.active) return;

        loopStartRef.current = currentTime;
        setIsHoldingLoop(true);
        ignoreClickRef.current = false;
    };

    const handleLoopUp = () => {
        if (!isHoldingLoop) return;
        setIsHoldingLoop(false);

        const loopDuration = currentTime - loopStartRef.current;

        if (loopDuration > 0.2) {
            onLoopSet(loopStartRef.current, currentTime);
            ignoreClickRef.current = true;
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

    const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    };

    return (
        <div className={`deck glass-panel ${isPlaying ? 'is-playing' : ''}`} style={{ '--deck-color': color, '--deck-color-rgb': hexToRgb(color) } as React.CSSProperties}>
            <div className="deck-header">
                <div className="deck-header-left">
                    <div className="deck-label" style={{ background: color }}>
                        DECK {deckId}
                    </div>
                </div>
                {track && (
                    <div className="deck-track-info">
                        <div className="deck-track-name">{track.name}</div>
                        {effectiveBPM && (
                            <div className="deck-bpm-display">
                                <span className="deck-bpm-label">BPM</span>
                                <span className="deck-bpm-value">{effectiveBPM}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Scrollable Waveform with Beat Grid */}
            {(track || state.isLoading) && (
                <ScrollableWaveform
                    audioUrl={track?.url || null}
                    currentTime={state.isLoading ? 0 : currentTime}
                    duration={track?.duration || 0}
                    onSeek={onSeek}
                    onScratch={onScratch}
                    onReleaseScratch={onReleaseScratch}
                    color={color}
                    bpm={track?.bpm}
                    height={window.innerWidth <= 767 ? 52 : (window.innerWidth < 1200 && window.innerWidth >= 768 ? 65 : 78)}
                    isLoading={state.isLoading}
                />
            )}

            <div className="deck-vinyl-row">
                {/* Deck A: Pitch Slider on LEFT */}
                {deckId === 'A' && (
                    <div className="deck-pitch-control-vertical" style={{ marginRight: 'var(--gap-lg, 12px)' }}>
                        <VerticalSlider
                            value={pitch}
                            min={-10}
                            max={10}
                            onChange={(val) => onPitchChange(parseFloat(val.toFixed(2)))}
                            label="PITCH"
                            showValue={true}
                            valueFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                            color={color}
                            className="deck-pitch-slider-vertical"
                        />
                    </div>
                )}

                {/* Central Vinyl / Loading / Placeholder Area */}
                <div className="deck-center-stage">
                    {state.isLoading ? (
                        <div className="deck-waveform-loading">
                            <div className="deck-loading-spinner"></div>
                            <span>Downloading track...</span>
                        </div>
                    ) : track ? (
                        <div className="deck-vinyl-container">
                            <Waveform
                                audioUrl={track.url}
                                currentTime={currentTime}
                                duration={track.duration || 0}
                                isPlaying={isPlaying}
                                color={color}
                                onScratch={onScratch}
                                onReleaseScratch={onReleaseScratch}
                                onSeek={onSeek}
                            />
                        </div>
                    ) : (
                        <div className="deck-waveform-placeholder">
                            <span>Load a track to begin</span>
                        </div>
                    )}
                </div>

                {/* Deck B: Pitch Slider on RIGHT */}
                {deckId === 'B' && (
                    <div className="deck-pitch-control-vertical" style={{ marginLeft: 'var(--gap-lg, 12px)' }}>
                        <VerticalSlider
                            value={pitch}
                            min={-10}
                            max={10}
                            onChange={(val) => onPitchChange(parseFloat(val.toFixed(2)))}
                            label="PITCH"
                            showValue={true}
                            valueFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                            color={color}
                            className="deck-pitch-slider-vertical"
                        />
                    </div>
                )}
            </div>

            <div className="deck-controls">
                <div className="deck-transport">
                    <div className="deck-transport-main">
                        <div className="deck-playback-controls">
                            {isPlaying ? (
                                <button className="deck-btn-play-pause active" onClick={onPause}>
                                    <PauseIcon />
                                    {shortcuts?.play && <span className="shortcut-badge play-badge">{shortcuts.play}</span>}
                                </button>
                            ) : (
                                <button
                                    className="deck-btn-play-pause"
                                    onClick={onPlay}
                                    disabled={!track}
                                >
                                    <PlayIcon />
                                    {shortcuts?.play && <span className="shortcut-badge play-badge">{shortcuts.play}</span>}
                                </button>
                            )}

                            {/* FX Button - visible only on small screens */}
                            <button
                                className={`deck-btn-fx-toggle ${showEffects ? 'active' : ''}`}
                                onClick={() => setShowEffects(!showEffects)}
                                title="Open Effects"
                            >
                                FX
                            </button>


                            <TimeDisplay
                                currentTime={currentTime}
                                totalTime={track?.duration || 0}
                                color={color}
                                className="bottom-right"
                            />

                        </div>

                        <div className="deck-performance-controls">
                            <div className="deck-effects-grid-performance" style={{ touchAction: 'none' }}>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.reverb ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('reverb')}
                                    title="Reverb"
                                >REV</button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.delay ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('delay')}
                                    title="Delay"
                                >DLY</button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.filter ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('filter')}
                                    title="Low Pass Filter"
                                >
                                    LPF
                                    {shortcuts?.effect && <span className="shortcut-badge tiny">{shortcuts.effect}</span>}
                                </button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.hpf ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('hpf')}
                                    title="High Pass Filter"
                                >HPF</button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.distortion ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('distortion')}
                                    title="Distortion"
                                >DST</button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.bitcrusher ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('bitcrusher')}
                                    title="Bitcrusher"
                                >BIT</button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.flanger ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('flanger')}
                                    title="Flanger"
                                >FLG</button>
                                <button
                                    className={`deck-btn-effect ${activeEffects?.tremolo ? 'active' : ''}`}
                                    onClick={() => onToggleEffect('tremolo')}
                                    title="Tremolo"
                                >TRM</button>
                            </div>

                             <div className="deck-cues-row" style={{ touchAction: 'none' }}>
                                {[0, 1].map(index => (
                                    <button
                                        key={index}
                                        className={`deck-btn-cue ${cuePoints[index] !== undefined ? 'active' : ''}`}
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
                                        {index === 0 && shortcuts?.cue && (
                                            <span className="shortcut-badge tiny">{shortcuts.cue}</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="deck-loop-control" style={{ touchAction: 'none' }}>
                                <button
                                    className={`deck-btn-magic-loop ${activeLoop?.active || isHoldingLoop ? 'active' : ''} ${isHoldingLoop ? 'holding' : ''}`}
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

            {/* Effects Popup - for small screens */}
            <div className={`deck-effects-popup ${showEffects ? 'open' : ''}`} data-deck={deckId}>
                <div className="deck-effects-popup-header">
                    <span>EFFECTS - DECK {deckId}</span>
                    <button
                        className="deck-effects-popup-close"
                        onClick={() => setShowEffects(false)}
                    >✕</button>
                </div>
                <div className="deck-effects-popup-grid">
                    <button
                        className={`deck-btn-effect ${activeEffects?.reverb ? 'active' : ''}`}
                        onClick={() => onToggleEffect('reverb')}
                    >REV</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.delay ? 'active' : ''}`}
                        onClick={() => onToggleEffect('delay')}
                    >DLY</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.filter ? 'active' : ''}`}
                        onClick={() => onToggleEffect('filter')}
                    >LPF</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.hpf ? 'active' : ''}`}
                        onClick={() => onToggleEffect('hpf')}
                    >HPF</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.distortion ? 'active' : ''}`}
                        onClick={() => onToggleEffect('distortion')}
                    >DST</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.bitcrusher ? 'active' : ''}`}
                        onClick={() => onToggleEffect('bitcrusher')}
                    >BIT</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.flanger ? 'active' : ''}`}
                        onClick={() => onToggleEffect('flanger')}
                    >FLG</button>
                    <button
                        className={`deck-btn-effect ${activeEffects?.tremolo ? 'active' : ''}`}
                        onClick={() => onToggleEffect('tremolo')}
                    >TRM</button>
                </div>
            </div>
        </div >
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

