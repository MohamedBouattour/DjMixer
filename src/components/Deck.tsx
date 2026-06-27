import React, { useState, useRef, useEffect } from 'react';
import type { DeckState } from '../types';
import { Waveform } from './Waveform';
import { ScrollableWaveform } from './ScrollableWaveform';
import VerticalSlider from './VerticalSlider';
import { TimeDisplay } from './TimeDisplay';
import { formatTime } from '../utils/helpers';
import { cn } from '../utils/cn';

interface DeckProps {
    deckId: 'A' | 'B';
    state: DeckState;
    controls: {
        play: () => void;
        pause: () => void;
        seek: (time: number) => void;
        setPitch: (pitch: number) => void;
        startScratch: () => void;
        endScratch: () => void;
        setScratchRate: (rate: number) => void;
        toggleEffect: (effect: 'reverb' | 'delay' | 'filter' | 'distortion' | 'bitcrusher' | 'flanger' | 'tremolo' | 'hpf') => void;
        handleCue: (index: number) => void;
        deleteCue: (index: number) => void;
        setLoop: (start: number, end: number) => void;
        clearLoop: () => void;
        setIsLoading: (isLoading: boolean) => void;
    };
    color: string;
    shortcuts?: {
        play?: string;
        cue?: string;
        effect?: string;
    };
    isAutoMixActive?: boolean;
    isAutoMixIdle?: boolean;
    onAutoMixRefetch?: () => void;
    onAutoMixTrigger?: () => void;
    autoMixPhase?: string;
}

export const Deck: React.FC<DeckProps> = ({
    deckId,
    state,
    controls,
    color,
    shortcuts,
    isAutoMixActive,
    isAutoMixIdle,
    onAutoMixRefetch,
    onAutoMixTrigger,
    autoMixPhase
}) => {
    const { track, isPlaying, currentTime, pitch, activeEffects, cuePoints, activeLoop } = state;
    const { 
        play, pause, seek, setPitch, startScratch, endScratch, setScratchRate,
        toggleEffect, handleCue, deleteCue, setLoop, clearLoop 
    } = controls;

    const [showEffects, setShowEffects] = useState(false);

    // ✅ Bug G Fix: Dynamic waveform height on resize
    const [waveHeight, setWaveHeight] = useState(() => 
        window.innerWidth <= 767 ? 52 : (window.innerWidth < 1200 ? 65 : 78)
    );

    useEffect(() => {
        const handleResize = () => {
            setWaveHeight(window.innerWidth <= 767 ? 52 : (window.innerWidth < 1200 ? 65 : 78));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const loopStartRef = useRef<number>(0);
    const ignoreClickRef = useRef<boolean>(false);
    const [isHoldingLoop, setIsHoldingLoop] = useState(false);

    // Close FX popup on click outside
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
            setLoop(loopStartRef.current, currentTime);
            ignoreClickRef.current = true;
        }
    };

    const handleLoopClick = () => {
        if (ignoreClickRef.current) {
            ignoreClickRef.current = false;
            return;
        }

        if (activeLoop?.active) {
            clearLoop();
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
        <div 
            className={cn(
                "flex flex-col p-2 gap-2 relative overflow-hidden min-w-0 content-visibility-auto w-[42%] flex-initial grow",
                "bg-surface-container/40 backdrop-blur-xl border-x border-white/5",
                isPlaying && "shadow-[inset_0_0_40px_rgba(var(--deck-color-rgb),0.05)]",
                "max-xl:p-1.5 max-xl:gap-1.5",
                "landscape:p-0.5 landscape:gap-0.5"
            )} 
            style={{ 
                '--deck-color': color, 
                '--deck-color-rgb': hexToRgb(color) 
            } as React.CSSProperties}
        >
            <div className="flex items-center justify-between h-7 shrink-0 pb-1 border-b border-white/10 max-xl:h-6 landscape:h-5 landscape:pb-0.5">
                <div className="flex items-center gap-2">
                    <div 
                        className="text-white px-3 py-1 text-[11px] font-extrabold tracking-widest rounded-sm shadow-[0_0_12px_var(--deck-color)] max-xl:text-[10px] max-xl:px-2 max-xl:py-0.5 landscape:text-[8px] landscape:px-1 landscape:py-0.5 landscape:tracking-tight font-display" 
                        style={{ background: color }}
                    >
                        DECK {deckId}
                    </div>
                </div>
                {track && (
                    <div className="flex items-center gap-3 flex-1 justify-end overflow-hidden">
                        {isAutoMixActive && isAutoMixIdle && (
                            <div className="flex items-center gap-1.5 shrink-0">
                                {onAutoMixRefetch && (
                                    <button
                                        onClick={onAutoMixRefetch}
                                        title="Refetch Auto Mix Suggestion"
                                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold border border-white/10 transition-colors shrink-0 max-xl:text-[9px] max-xl:px-1.5 landscape:text-[8px] cursor-pointer"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                        </svg>
                                        <span>REFETCH</span>
                                    </button>
                                )}
                                {autoMixPhase === 'LOOPING' && onAutoMixTrigger && (
                                    <button
                                        onClick={onAutoMixTrigger}
                                        title="Trigger transition into this deck immediately"
                                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-br from-deck-a to-deck-b text-white text-[10px] font-bold border border-white/20 transition-all cursor-pointer shadow-[0_0_8px_rgba(255,0,128,0.5)] hover:scale-105 active:scale-95 max-xl:text-[9px] max-xl:px-1.5 landscape:text-[8px]"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M13 2v9h7L11 22v-9H4l9-10z" />
                                        </svg>
                                        <span>MIX NOW</span>
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="text-[13px] font-semibold text-on-surface truncate max-xl:text-[11px] landscape:text-[10px] font-display">{track.name}</div>
                        {effectiveBPM && (
                            <div className="flex flex-col items-center">
                                <span className="text-[9px] text-text-muted font-bold tracking-widest">BPM</span>
                                <span className="text-[18px] font-extrabold leading-none max-xl:text-[14px] landscape:text-[12px]" style={{ color, textShadow: `0 0 8px ${color}` }}>{effectiveBPM}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Scrollable Waveform */}
            {(track || state.isLoading) && (
                <ScrollableWaveform
                    audioUrl={track?.url || null}
                    currentTime={state.isLoading ? 0 : currentTime}
                    duration={track?.duration || 0}
                    isPlaying={isPlaying}
                    onSeek={seek}
                    onScratch={setScratchRate}
                    onScratchStart={startScratch}
                    onScratchEnd={endScratch}
                    color={color}
                    bpm={track?.bpm}
                    height={waveHeight}
                    isLoading={state.isLoading}
                />
            )}

            <div className="flex-1 flex items-center justify-center gap-3 min-h-0 relative w-full landscape:gap-1">
                {/* Deck A: Pitch Slider on LEFT */}
                {deckId === 'A' && (
                    <div className="w-10 h-full flex flex-col items-center gap-1 shrink-0 mr-3 max-xl:w-8 landscape:w-5 landscape:mr-1">
                        <VerticalSlider
                            value={pitch}
                            min={-10}
                            max={10}
                            onChange={(val) => setPitch(parseFloat(val.toFixed(2)))}
                            label="PITCH"
                            showValue={true}
                            valueFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                            color={color}
                            className="flex-1 w-full flex flex-col items-center"
                        />
                    </div>
                )}

                {/* Central Vinyl Area */}
                <div className="flex-1 flex items-center justify-center w-full h-full min-w-0">
                    {state.isLoading ? (
                        <div className="w-full aspect-square max-w-[320px] mx-auto flex flex-col items-center justify-center bg-surface-container rounded-full text-outline text-xs text-center border-2 border-white/10 gap-2 max-xl:max-w-[180px]">
                            <div className="w-6 h-6 border-2 border-white/10 border-t-[var(--deck-color)] rounded-full animate-[deck-spin_1s_linear_infinite]"></div>
                            <span className="text-on-surface-variant">Downloading track...</span>
                        </div>
                    ) : track ? (
                        <div className="w-full flex justify-center items-center">
                            <Waveform
                                currentTime={currentTime}
                                duration={track.duration || 0}
                                isPlaying={isPlaying}
                                color={color}
                                onScratch={setScratchRate}
                                onScratchStart={startScratch}
                                onScratchEnd={endScratch}
                                onSeek={seek}
                            />
                        </div>
                    ) : (
                        <div className="w-full aspect-square max-w-[320px] mx-auto flex flex-col items-center justify-center bg-surface-container rounded-full text-outline text-xs text-center border-2 border-white/10 gap-2 max-xl:max-w-[180px]">
                            <span className="text-on-surface-variant">Load a track to begin</span>
                        </div>
                    )}
                </div>

                {/* Deck B: Pitch Slider on RIGHT */}
                {deckId === 'B' && (
                    <div className="w-10 h-full flex flex-col items-center gap-1 shrink-0 ml-3 max-xl:w-8 landscape:w-5 landscape:ml-1">
                        <VerticalSlider
                            value={pitch}
                            min={-10}
                            max={10}
                            onChange={(val) => setPitch(parseFloat(val.toFixed(2)))}
                            label="PITCH"
                            showValue={true}
                            valueFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                            color={color}
                            className="flex-1 w-full flex flex-col items-center"
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-2 shrink-0 max-xl:gap-1.5 landscape:gap-0.5">
                <div className="flex flex-col gap-2 max-xl:gap-1.5 landscape:gap-0.5">
                    <div className="flex flex-col gap-2 max-xl:gap-1.5 landscape:gap-0.5">
                        <div className="flex items-center gap-2 w-full max-xl:gap-1.5 landscape:gap-0.5">
                            {isPlaying ? (
                                <button 
                                    className="w-[101px] h-[101px] rounded-full flex items-center justify-center transition-all duration-150 shrink-0 bg-[var(--deck-color)] shadow-[0_0_25px_var(--deck-color)] relative max-xl:w-[60px] max-xl:h-[60px] max-md:w-[68px] max-md:h-[68px] landscape:w-[47px] landscape:h-[47px]" 
                                    onClick={pause}
                                >
                                    <PauseIcon />
                                    {shortcuts?.play && <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded-sm border border-white/10 font-mono text-[8px]">{shortcuts.play}</span>}
                                </button>
                            ) : (
                                <button
                                    className="w-[101px] h-[101px] rounded-full bg-surface-container-highest border-2 border-white/10 text-white flex items-center justify-center transition-all duration-150 shrink-0 hover:enabled:border-[var(--deck-color)] hover:enabled:shadow-[0_0_20px_var(--deck-color)] disabled:opacity-30 disabled:cursor-not-allowed relative max-xl:w-[60px] max-xl:h-[60px] max-md:w-[68px] max-md:h-[68px] landscape:w-[47px] landscape:h-[47px]"
                                    onClick={play}
                                    disabled={!track}
                                >
                                    <PlayIcon />
                                    {shortcuts?.play && <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded-sm border border-white/10 font-mono text-[8px]">{shortcuts.play}</span>}
                                </button>
                            )}

                            <button
                                className={cn(
                                    "hidden max-md:flex items-center justify-center w-[42px] h-[42px] rounded-lg bg-gradient-to-br from-deck-a to-deck-b text-white text-[12px] font-extrabold tracking-tight cursor-pointer shadow-[0_2px_10px_rgba(255,0,128,0.3)] transition-all duration-150 hover:scale-105 hover:shadow-[0_4px_15px_rgba(255,0,128,0.4)] font-mono",
                                    showEffects && "ring-2 ring-white/50"
                                )}
                                onClick={() => setShowEffects(!showEffects)}
                                title="Open Effects"
                            >
                                FX
                            </button>

                            <TimeDisplay
                                currentTime={currentTime}
                                totalTime={track?.duration || 0}
                                color={color}
                                className="flex-1"
                            />
                        </div>

                        <div className="flex flex-col gap-2 max-xl:gap-1.5 landscape:gap-0.5">
                            <div className="flex gap-1 flex-wrap landscape:hidden" style={{ touchAction: 'none' }}>
                                {(['reverb', 'delay', 'filter', 'hpf', 'distortion', 'bitcrusher', 'flanger', 'tremolo'] as const).map(fx => (
                                    <button
                                        key={fx}
                                        className={cn(
                                            "flex-1 min-w-[94px] h-[66px] bg-surface-container-high border border-white/10 rounded-lg text-on-surface-variant text-[20px] font-bold transition-all duration-150 hover:border-[var(--deck-color)] hover:text-white relative font-mono tracking-wider",
                                            activeEffects?.[fx] && "bg-[var(--deck-color)] border-[var(--deck-color)] text-white shadow-[0_0_12px_var(--deck-color)]",
                                            "max-xl:min-w-[52px] max-xl:h-[39px] max-xl:text-[12px]",
                                            "max-md:min-w-[62px] max-md:h-[44px] max-md:text-[13px]"
                                        )}
                                        onClick={() => toggleEffect(fx)}
                                        title={fx.toUpperCase()}
                                    >
                                        {fx.substring(0, 3).toUpperCase()}
                                        {fx === 'filter' && shortcuts?.effect && <span className="absolute bottom-0.5 right-0.5 text-[8px] opacity-60 font-sans">{shortcuts.effect}</span>}
                                    </button>
                                ))}
                            </div>

                             <div className="flex gap-1" style={{ touchAction: 'none' }}>
                                {[0, 1].map(index => (
                                    <button
                                        key={index}
                                        className={cn(
                                            "flex-1 h-[66px] bg-surface-container-high border border-white/10 rounded-lg text-on-surface-variant text-[26px] font-bold transition-all duration-150 hover:border-[var(--deck-color)] hover:text-white relative font-mono",
                                            cuePoints[index] !== undefined && "bg-[var(--deck-color)] border-[var(--deck-color)] text-white shadow-[0_0_12px_var(--deck-color)]",
                                            "max-xl:h-[39px] max-xl:text-[12px] max-xl:min-w-[52px]",
                                            "landscape:h-[31px] landscape:text-[10px] landscape:min-w-[39px]",
                                            "max-md:h-[44px] max-md:text-[17px]"
                                        )}
                                        onClick={(e) => {
                                            if (e.shiftKey) {
                                                deleteCue(index);
                                            } else {
                                                handleCue(index);
                                            }
                                        }}
                                        title={cuePoints[index] !== undefined ? `Jump to ${formatTime(cuePoints[index])} (Shift+Click to clear)` : 'Set Cue'}
                                    >
                                        {index + 1}
                                        {index === 0 && shortcuts?.cue && (
                                            <span className="absolute bottom-0.5 right-0.5 text-[8px] opacity-60">{shortcuts.cue}</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-1 landscape:mt-0" style={{ touchAction: 'none' }}>
                                <button
                                    className={cn(
                                        "w-full h-[74px] flex items-center justify-center gap-2 bg-surface-container-high border border-white/10 rounded-lg text-on-surface-variant text-[20px] font-bold tracking-tight transition-all duration-150 hover:border-[var(--deck-color)] hover:text-white",
                                        (activeLoop?.active || isHoldingLoop) && "bg-[var(--deck-color)] border-[var(--deck-color)] text-white shadow-[0_0_15px_var(--deck-color)]",
                                        isHoldingLoop && "border-[var(--deck-color)] text-[var(--deck-color)] bg-white/2",
                                        "max-xl:h-[42px] max-xl:text-[12px]",
                                        "landscape:h-[31px] landscape:text-[10px]",
                                        "max-md:h-[49px] max-md:text-[13px]"
                                    )}
                                    onMouseDown={handleLoopDown}
                                    onMouseUp={handleLoopUp}
                                    onMouseLeave={handleLoopUp}
                                    onClick={handleLoopClick}
                                    onTouchStart={handleLoopDown}
                                    onTouchEnd={handleLoopUp}
                                    title="Hold to Magic Loop (Release to activate)"
                                >
                                    <div className="w-6 h-6 max-xl:w-4 max-xl:h-4 landscape:w-3 landscape:h-3">
                                        <LoopIcon />
                                    </div>
                                    <span>MAGIC LOOP</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className={cn(
                "fixed bottom-0 left-0 right-0 bg-surface-container-low/95 backdrop-blur-xl border-t-2 border-[var(--deck-color)] z-[9000] flex flex-col p-3 transition-transform duration-250 translate-y-full",
                "pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pb-[max(12px,env(safe-area-inset-bottom))]",
                showEffects && "translate-y-0",
                "deck-effects-popup"
            )} data-deck={deckId}>
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[12px] font-extrabold text-[var(--deck-color)] tracking-widest uppercase font-display">EFFECTS - DECK {deckId}</span>
                    <button
                        className="w-7 h-7 rounded-full bg-surface-container border border-white/10 text-on-surface-variant text-sm flex items-center justify-center cursor-pointer hover:bg-error hover:text-white transition-all"
                        onClick={() => setShowEffects(false)}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {(['reverb', 'delay', 'filter', 'hpf', 'distortion', 'bitcrusher', 'flanger', 'tremolo'] as const).map(fx => (
                        <button
                            key={fx}
                            className={cn(
                                "h-11 bg-surface-container-high border border-white/10 rounded-lg text-on-surface-variant text-[12px] font-bold transition-all duration-150 hover:border-[var(--deck-color)] hover:text-white font-mono tracking-wider",
                                activeEffects?.[fx] && "bg-[var(--deck-color)] border-[var(--deck-color)] text-white shadow-[0_0_8px_var(--deck-color)]"
                            )}
                            onClick={() => toggleEffect(fx)}
                        >{fx.substring(0, 3).toUpperCase()}</button>
                    ))}
                </div>
            </div>
        </div >
    );
};

const PlayIcon = () => (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const PauseIcon = () => (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
);


const LoopIcon = () => (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
    </svg>
);
