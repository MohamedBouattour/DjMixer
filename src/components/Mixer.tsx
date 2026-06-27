import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { DeckState } from '../types';
import VerticalSlider from './VerticalSlider';
import Knob from './Knob';
import { cn } from '../utils/cn';

interface MixerProps {
    crossfaderValue: number;
    onCrossfaderChange: (value: number) => void;
    deckAState: DeckState;
    deckBState: DeckState;
    onVolumeChange: (deck: 'A' | 'B', value: number) => void;
    onEQChange: (deck: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number) => void;
    onGainChange?: (deck: 'A' | 'B', value: number) => void;
    onFilterChange?: (deck: 'A' | 'B', value: number) => void;
    isAutoMixActive?: boolean;
    activeDeck?: 'A' | 'B' | null;
    onTriggerTransition?: () => void;
    shortcuts?: {
        volumeA?: { up: string; down: string };
        volumeB?: { up: string; down: string };
        crossfader?: { left: string; right: string };
    };
}

export const Mixer: React.FC<MixerProps> = ({
    crossfaderValue,
    onCrossfaderChange,
    deckAState,
    deckBState,
    onVolumeChange,
    onEQChange,
    onGainChange,
    onFilterChange,
    isAutoMixActive,
    activeDeck,
    onTriggerTransition
}) => {
    const canTransition = !!(isAutoMixActive && activeDeck && (activeDeck === 'A' ? deckBState.track : deckAState.track));

    const [deckAGain, setDeckAGain] = useState(80);
    const [deckBGain, setDeckBGain] = useState(80);
    const [deckAFilter, setDeckAFilter] = useState(50);
    const [deckBFilter, setDeckBFilter] = useState(50);

    // Crossfader dragging state
    const crossfaderTrackRef = useRef<HTMLDivElement>(null);
    const isDraggingCrossfader = useRef(false);
    const crossfaderPointerId = useRef<number | null>(null);

    const updateCrossfader = useCallback((clientX: number) => {
        if (!crossfaderTrackRef.current) return;
        const rect = crossfaderTrackRef.current.getBoundingClientRect();
        const capWidth = 44;
        const halfCap = capWidth / 2;
        const relativeX = clientX - rect.left - halfCap;
        const clampedX = Math.max(0, Math.min(relativeX, rect.width - capWidth));
        const pct = clampedX / (rect.width - capWidth);
        onCrossfaderChange(pct * 100);
    }, [onCrossfaderChange]);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!isDraggingCrossfader.current || e.pointerId !== crossfaderPointerId.current) return;
            e.preventDefault();
            updateCrossfader(e.clientX);
        };
        const handlePointerUp = (e: PointerEvent) => {
            if (!isDraggingCrossfader.current || e.pointerId !== crossfaderPointerId.current) return;
            isDraggingCrossfader.current = false;
            crossfaderPointerId.current = null;
        };

        document.addEventListener('pointermove', handlePointerMove, { passive: false });
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerUp);
        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [updateCrossfader]);

    const handleCrossfaderPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        isDraggingCrossfader.current = true;
        crossfaderPointerId.current = e.pointerId;
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        updateCrossfader(e.clientX);
    };

    // Calculate VU meter levels based on volume and playing state
    const getVULevel = (isPlaying: boolean, volume: number) => {
        if (!isPlaying || volume < 10) return 0;
        return Math.min(12, Math.floor((volume / 150) * 12 * (0.7 + Math.random() * 0.5)));
    };

    const vuLevelA = getVULevel(deckAState.isPlaying, deckAState.volume);
    const vuLevelB = getVULevel(deckBState.isPlaying, deckBState.volume);

    const renderChannelStrip = (deckId: 'A' | 'B', state: DeckState, color: string) => {
        const gain = deckId === 'A' ? deckAGain : deckBGain;
        const filter = deckId === 'A' ? deckAFilter : deckBFilter;
        const setGain = deckId === 'A' ? setDeckAGain : setDeckBGain;
        const setFilter = deckId === 'A' ? setDeckAFilter : setDeckBFilter;
        const vuLevel = deckId === 'A' ? vuLevelA : vuLevelB;
        const onVolumeChangeHandler = (val: number) => onVolumeChange(deckId, val);

        const handleFilterKnobChange = (val: number) => {
            setFilter(val);
            onFilterChange?.(deckId, val);
        };

        const handleGainKnobChange = (val: number) => {
            setGain(val);
            onGainChange?.(deckId, val);
        };

        const renderKnobRow = (
            label: string,
            value: number,
            onChange: (v: number) => void,
            opts?: {
                hasButton?: boolean;
                btnLabel?: string;
                btnActive?: boolean;
                btnColor?: string;
                onBtnClick?: () => void;
                defaultValue?: number;
            }
        ) => {
            return (
                <div className="flex flex-col items-center py-2 hover:bg-white/[0.01] transition-colors rounded-sm">
                    {/* Top Row: Label + Action Button */}
                    <div className={cn(
                        "flex items-center justify-between w-full h-4 mb-2 px-1",
                        deckId === 'B' && "flex-row-reverse"
                    )}>
                        <span className="text-[12px] font-bold text-white tracking-widest font-mono select-none">{label}</span>
                        {opts?.hasButton && opts.btnLabel && (
                            <button
                                onClick={opts.onBtnClick}
                                className={cn(
                                    "text-[10px] font-extrabold px-[8px] py-[3px] rounded-[3px] border tracking-wider transition-all duration-100 font-mono uppercase leading-none",
                                    opts.btnActive
                                        ? "text-white border-current shadow-[0_0_4px_var(--glow-color)]"
                                        : "bg-black/30 text-white/20 border-white/[0.04] hover:border-white/10 hover:text-white/40"
                                )}
                                style={{
                                    backgroundColor: opts.btnActive ? `${opts.btnColor || color}30` : undefined,
                                    borderColor: opts.btnActive ? (opts.btnColor || color) : undefined,
                                    ['--glow-color' as string]: opts.btnColor || color
                                }}
                            >
                                {opts.btnLabel}
                            </button>
                        )}
                    </div>
                    {/* Knob */}
                    <Knob
                        value={value}
                        onChange={onChange}
                        color={color}
                        size={38}
                        defaultValue={opts?.defaultValue ?? 50}
                    />
                </div>
            );
        };

        return (
            <div className="flex-1 flex flex-col rounded-xl border border-white/5 bg-surface-container-low/20 overflow-hidden min-w-0">
                {/* Header */}
                <div className="text-[13px] font-bold text-center py-1.5 tracking-[0.15em] font-display select-none" style={{ color, backgroundColor: `${color}08` }}>
                    CH {deckId}
                </div>

                {/* Content: EQ on left, Volume + VU on right */}
                <div className={cn(
                    "flex-1 flex items-stretch p-2 gap-3 min-h-0",
                    deckId === 'B' && "flex-row-reverse"
                )}>
                    {/* Left: EQ Knobs */}
                    <div className="w-[65%] flex flex-col divide-y divide-white/[0.02] bg-black/10 rounded-lg p-1.5">
                        {renderKnobRow('GAIN', gain, handleGainKnobChange, { defaultValue: 80 })}
                        
                        {renderKnobRow('FLTR', filter, handleFilterKnobChange)}

                        {renderKnobRow('HI', state.eq.high, (val) => onEQChange(deckId, 'high', val))}

                        {renderKnobRow('MID', state.eq.mid, (val) => onEQChange(deckId, 'mid', val))}

                        {renderKnobRow('LOW', state.eq.low, (val) => onEQChange(deckId, 'low', val))}
                    </div>

                    {/* Right: Volume Fader + VU */}
                    <div className={cn(
                        "flex-1 flex gap-2 items-stretch",
                        deckId === 'B' && "flex-row-reverse"
                    )}>
                        {/* VU Meter */}
                        <div className="flex flex-col-reverse gap-[2px] w-5 min-w-[20px] shrink-0 p-[3px] bg-black/30 rounded-md border border-white/[0.04]">
                            {Array.from({ length: 12 }).map((_, i) => {
                                const isActive = i < vuLevel;
                                const isPeak = i >= 10;
                                const isHigh = i >= 8;
                                return (
                                    <div 
                                        key={i} 
                                        className={cn(
                                            "flex-1 min-h-[4px] bg-white/[0.04] rounded-[1.5px] transition-all duration-75",
                                            isActive && !isHigh && !isPeak && "bg-[#00cc66] shadow-[0_0_4px_#00cc66]",
                                            isActive && isHigh && !isPeak && "bg-[#cc9900] shadow-[0_0_4px_#cc9900]",
                                            isActive && isPeak && "bg-[#cc3333] shadow-[0_0_5px_#cc3333]"
                                        )} 
                                    />
                                );
                            })}
                        </div>

                        {/* Volume Fader */}
                        <div className="flex-1 bg-black/20 rounded-md border border-white/[0.04] relative flex items-center justify-center overflow-hidden">
                            <VerticalSlider
                                value={state.volume}
                                min={0}
                                max={150}
                                onChange={onVolumeChangeHandler}
                                label=""
                                showValue={false}
                                color={color}
                                className="w-full h-full flex flex-col items-center py-3 [&_.track]:w-[4px] [&_.track]:bg-black/60 [&_.thumb]:w-[28px] [&_.thumb]:h-[16px] [&_.thumb]:rounded-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center p-2 gap-2 h-full w-full bg-surface-container-low/30 backdrop-blur-sm max-xl:p-1 max-xl:gap-1 landscape:p-1 landscape:gap-1">
            
            {/* Main Channels Strip section */}
            <div className="flex-1 flex items-stretch justify-center gap-1.5 p-1 bg-surface-container/60 rounded-xl min-h-0 w-full border border-white/5">
                {renderChannelStrip('A', deckAState, '#ff0080')}
                
                {/* Center MIX column */}
                <div className="flex flex-col items-center justify-between py-8 px-1 min-w-[44px] max-xl:min-w-[36px] landscape:min-w-[32px] landscape:py-6">
                    <span className="text-[14px] font-bold text-deck-a whitespace-nowrap font-mono select-none">{Math.round(deckAState.volume)}%</span>
                    
                    <div className="flex flex-col items-center gap-1.5 my-auto">
                        <span className="text-[13px] font-extrabold tracking-widest text-white/70 font-display select-none">MIX</span>
                        {isAutoMixActive && (
                            <div className="text-[8px] font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-deck-a to-deck-b animate-[auto-mix-pulse_2s_ease-in-out_infinite] font-display">
                                AUTO
                            </div>
                        )}
                        {isAutoMixActive && onTriggerTransition && (
                            <button
                                className={cn(
                                    "text-[8px] font-bold text-white border-none px-2 py-1 rounded-md tracking-wider cursor-pointer transition-all duration-200 shadow-md font-mono scale-90",
                                    canTransition
                                        ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_2px_6px_rgba(245,158,11,0.4)] hover:scale-105"
                                        : "bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed opacity-50"
                                )}
                                onClick={canTransition ? onTriggerTransition : undefined}
                                disabled={!canTransition}
                                title={canTransition ? "Force transition to the next track manually" : "Load a track on the idle deck first"}
                            >
                                GO
                            </button>
                        )}
                    </div>

                    <span className="text-[10px] font-bold text-deck-b whitespace-nowrap font-mono select-none">{Math.round(deckBState.volume)}%</span>
                </div>

                {renderChannelStrip('B', deckBState, '#00d4ff')}
            </div>

            {/* Crossfader section */}
            <div className="w-full px-4 py-2 bg-surface-container/60 rounded-xl shrink-0 border border-white/5 flex flex-col items-center">
                {/* Labels above fader */}
                <div className="flex justify-between w-full px-5 mb-1 text-[8px] font-bold text-white/30 tracking-widest font-mono select-none">
                    <span>A</span>
                    <span>CENTER</span>
                    <span>B</span>
                </div>

                {/* Crossfader Track */}
                <div 
                    ref={crossfaderTrackRef}
                    className="relative w-full h-8 rounded-md bg-black/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_1px_1px_rgba(255,255,255,0.05)] border border-white/5 cursor-pointer touch-none flex items-center"
                    style={{ touchAction: 'none' }}
                    onPointerDown={handleCrossfaderPointerDown}
                    onDoubleClick={() => onCrossfaderChange(50)}
                    title="Drag to mix, double-click to center"
                >
                    {/* Scale Tick Marks on Track */}
                    <div className="absolute top-0 bottom-0 left-[22px] right-[22px] pointer-events-none flex justify-between items-center opacity-30">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div 
                                key={i} 
                                className={cn(
                                    "w-[1px] bg-white",
                                    i === 4 ? "h-3 opacity-80" : "h-1.5 opacity-40" // Center tick is taller
                                )} 
                            />
                        ))}
                    </div>

                    {/* Groove Line */}
                    <div className="absolute inset-x-2 h-[2px] bg-black/80 border-b border-white/10 rounded-full pointer-events-none" />

                    {/* Fader Thumb / Cap */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 rounded-[4px] cursor-grab active:cursor-grabbing z-10 border border-black/80 flex items-center justify-center transition-all duration-75"
                        style={{
                            left: `calc(${crossfaderValue} * (100% - 44px) / 100)`, // 44px wide cap
                            width: '44px',
                            height: '24px',
                            background: 'linear-gradient(180deg, #3d3e42 0%, #1e1f22 100%)',
                            boxShadow: '0 3px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}
                    >
                        {/* Center Indicator Line on Cap */}
                        <div className="w-[2px] h-[16px] bg-white/80 rounded-full shadow-[0_0_4px_rgba(255,255,255,0.5)]" />
                    </div>
                </div>
            </div>
        </div>
    );
};
