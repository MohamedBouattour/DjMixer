import React, { useState } from 'react';
import type { DeckState } from '../types';
import VerticalSlider from './VerticalSlider';
import HorizontalSlider from './HorizontalSlider';
import { cn } from '../utils/cn';

interface MixerProps {
    crossfaderValue: number;
    onCrossfaderChange: (value: number) => void;
    deckAState: DeckState;
    deckBState: DeckState;
    onVolumeChange: (deck: 'A' | 'B', value: number) => void;
    onEQChange: (deck: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number) => void;
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
    isAutoMixActive,
    activeDeck,
    onTriggerTransition
}) => {
    const [isEQPopupOpen, setIsEQPopupOpen] = useState(false);

    const canTransition = !!(isAutoMixActive && activeDeck && (activeDeck === 'A' ? deckBState.track : deckAState.track));

    const renderEQControls = (deckId: 'A' | 'B', state: DeckState, color: string) => {
        const { eq } = state;
        return (
            <div className="bg-black/30 rounded-xl p-3 border border-white/5" style={{ '--deck-color': color } as React.CSSProperties}>
                <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-extrabold text-white py-1 px-2 rounded-full text-center shadow-[0_4px_10px_rgba(0,0,0,0.3)] tracking-widest" style={{ background: color }}>DECK {deckId}</div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-white/40 border border-white/20 rounded-full px-2 py-0.5">{deckId === 'A' ? 'ACTIVE' : 'CUE'}</span>
                </div>
                <div className="flex gap-2 justify-center">
                    {([['low', '60Hz'], ['mid', '1kHz'], ['high', '10kHz']] as const).map(([band, freq]) => (
                        <div key={band} className="flex flex-col items-center gap-1">
                            <span className="text-[7px] font-bold text-white/40 uppercase tracking-widest">{freq}</span>
                            <VerticalSlider
                                value={eq[band]}
                                min={0}
                                max={100}
                                onChange={(val) => onEQChange(deckId, band, val)}
                                label={band.toUpperCase()}
                                showValue={false}
                                color={color}
                                height={110}
                                className="h-[120px] w-9 py-2 [&_.track]:w-1.5 [&_.track]:bg-black/50 [&_.track]:border-white/10 [&_.track]:px-0 [&_.track]:shadow-none [&_.thumb]:w-7 [&_.thumb]:h-3.5 [&_.thumb]:before:left-1 [&_.thumb]:before:right-1 [&_.thumb]:after:left-1 [&_.thumb]:after:right-1 [&_.vertical-slider-label]:mb-2 [&_.vertical-slider-label]:text-[9px] [&_.vertical-slider-label]:opacity-70"
                            />
                            <span className="text-[9px] font-mono text-white/60">{Math.round(((eq[band] - 50) / 50) * 6)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Calculate VU meter levels based on volume and playing state
    const getVULevel = (isPlaying: boolean, volume: number) => {
        if (!isPlaying || volume < 10) return 0;
        return Math.min(12, Math.floor((volume / 150) * 12 * (0.7 + Math.random() * 0.5)));
    };

    const vuLevelA = getVULevel(deckAState.isPlaying, deckAState.volume);
    const vuLevelB = getVULevel(deckBState.isPlaying, deckBState.volume);

    return (
        <>
            <div className="flex flex-col items-center p-2 gap-2 h-full w-full bg-gradient-to-b from-bg-dark via-bg-darker to-bg-darkest border-x border-white/15 max-xl:p-1 max-xl:gap-1 landscape:p-1 landscape:gap-1">
                {/* Top row: VOL labels */}
                <div className="flex items-center justify-between px-1 w-full shrink-0 min-h-[24px] landscape:min-h-[20px]">
                    <span className="text-[13px] font-bold tracking-widest text-deck-a max-xl:text-[11px] landscape:text-[9px] landscape:tracking-tight">VOL</span>
                    <span className="text-[13px] font-bold tracking-widest text-deck-b max-xl:text-[11px] landscape:text-[9px] landscape:tracking-tight">VOL</span>
                </div>

                {/* Main faders section */}
                <div className="flex-1 flex items-stretch justify-center gap-2 p-2 bg-black/40 rounded-lg min-h-0 w-full max-xl:p-1 max-xl:gap-1 landscape:p-1 landscape:gap-[3px]">
                    {/* Deck A: Slider + VU */}
                    <div className="flex flex-row items-stretch gap-2 flex-1 landscape:gap-[3px]">
                        <div className="flex-1 w-full min-w-[60px] max-w-[68px] bg-gradient-to-b from-[#3a3a3a] via-bg-dark via-bg-darker via-bg-dark to-[#3a3a3a] rounded-md relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.6),inset_0_0_20px_rgba(0,0,0,0.4)] flex items-center justify-center border border-white/10 overflow-hidden max-xl:min-w-[52px] max-xl:max-w-[58px] landscape:min-w-[44px] landscape:max-w-[50px]">
                            <VerticalSlider
                                value={deckAState.volume}
                                min={0}
                                max={150}
                                onChange={(val) => onVolumeChange('A', val)}
                                label=""
                                showValue={false}
                                color="#ff0080"
                                className="w-full h-full flex flex-col items-center py-2"
                            />
                        </div>
                        <div className="flex flex-col-reverse gap-0.5 w-7 min-w-[28px] shrink-0 p-1 bg-gradient-to-b from-bg-darkest to-[#050505] rounded-sm border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] max-xl:w-6 max-xl:min-w-[24px] landscape:w-[18px] landscape:min-w-[18px] landscape:p-0.5 landscape:gap-[1px]">
                            {Array.from({ length: 12 }).map((_, i) => {
                                const segmentIndex = i;
                                const isActive = segmentIndex < vuLevelA;
                                const isPeak = segmentIndex >= 10;
                                const isHigh = segmentIndex >= 8;
                                return (
                                    <div 
                                        key={i} 
                                        className={cn(
                                            "flex-1 min-h-[6px] bg-bg-dark rounded-[1px] transition-all duration-75 border border-black/30",
                                            isActive && !isHigh && !isPeak && "bg-gradient-to-r from-[#00cc66] via-accent-green to-[#00cc66] shadow-[0_0_6px_var(--color-accent-green)] border-transparent",
                                            isActive && isHigh && !isPeak && "bg-gradient-to-r from-[#cc9900] via-accent-yellow to-[#cc9900] shadow-[0_0_6px_var(--color-accent-yellow)] border-transparent",
                                            isActive && isPeak && "bg-gradient-to-r from-[#cc3333] via-accent-red to-[#cc3333] shadow-[0_0_8px_var(--color-accent-red)] border-transparent",
                                            "landscape:min-h-[4px]"
                                        )} 
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Center: MIX label and volume percentages */}
                    <div className="flex flex-col items-center justify-center gap-2 px-1 min-w-[50px] max-xl:gap-2 max-xl:min-w-[44px] landscape:min-w-[36px] landscape:gap-[2px] landscape:p-[1px]">
                        <span className="text-[12px] font-bold text-deck-a whitespace-nowrap max-xl:text-[11px] landscape:text-[9px]">{Math.round(deckAState.volume)}%</span>
                        {isAutoMixActive && (
                            <div className="text-[9px] font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-deck-a to-deck-b animate-[auto-mix-pulse_2s_ease-in-out_infinite] mb-1">
                                AUTO
                            </div>
                        )}
                        <button
                            className="text-[25px] font-extrabold text-white bg-gradient-to-br from-deck-a to-deck-b border-none px-[31px] py-[18px] rounded-lg tracking-widest cursor-pointer transition-all duration-200 shadow-[0_2px_8px_rgba(255,0,128,0.3),0_2px_8px_rgba(0,212,255,0.3)] hover:scale-105 hover:shadow-[0_4px_12px_rgba(255,0,128,0.5),0_4px_12px_rgba(0,212,255,0.5)] active:scale-95 max-xl:text-[18px] max-xl:px-[21px] max-xl:py-[13px] landscape:text-[14px] landscape:px-4 landscape:py-2.5 max-md:text-[11px] max-md:px-3.5 max-md:py-2 max-md:rounded-md"
                            onClick={() => setIsEQPopupOpen(true)}
                            title="Open Mixer & EQ Settings"
                        >
                            MIX
                        </button>
                        {isAutoMixActive && onTriggerTransition && (
                            <button
                                className={cn(
                                    "text-[9px] font-bold text-white border-none px-3.5 py-1.5 rounded-md tracking-wider cursor-pointer transition-all duration-200 shadow-md",
                                    canTransition
                                        ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_2px_6px_rgba(245,158,11,0.4)] hover:scale-105 hover:shadow-[0_4px_10px_rgba(245,158,11,0.6)] active:scale-95"
                                        : "bg-gray-700/50 text-white/30 cursor-not-allowed opacity-50"
                                )}
                                onClick={canTransition ? onTriggerTransition : undefined}
                                disabled={!canTransition}
                                title={canTransition ? "Force transition to the next track manually" : "Load a track on the idle deck first"}
                            >
                                TRANSITION
                            </button>
                        )}
                        <span className="text-[12px] font-bold text-deck-b whitespace-nowrap max-xl:text-[11px] landscape:text-[9px]">{Math.round(deckBState.volume)}%</span>
                    </div>

                    {/* Deck B: VU + Slider */}
                    <div className="flex flex-row items-stretch gap-2 flex-1 landscape:gap-[3px]">
                        <div className="flex flex-col-reverse gap-0.5 w-7 min-w-[28px] shrink-0 p-1 bg-gradient-to-b from-bg-darkest to-[#050505] rounded-sm border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] max-xl:w-6 max-xl:min-w-[24px] landscape:w-[18px] landscape:min-w-[18px] landscape:p-0.5 landscape:gap-[1px]">
                            {Array.from({ length: 12 }).map((_, i) => {
                                const segmentIndex = i;
                                const isActive = segmentIndex < vuLevelB;
                                const isPeak = segmentIndex >= 10;
                                const isHigh = segmentIndex >= 8;
                                return (
                                    <div 
                                        key={i} 
                                        className={cn(
                                            "flex-1 min-h-[6px] bg-bg-dark rounded-[1px] transition-all duration-75 border border-black/30",
                                            isActive && !isHigh && !isPeak && "bg-gradient-to-r from-[#00cc66] via-accent-green to-[#00cc66] shadow-[0_0_6px_var(--color-accent-green)] border-transparent",
                                            isActive && isHigh && !isPeak && "bg-gradient-to-r from-[#cc9900] via-accent-yellow to-[#cc9900] shadow-[0_0_6px_var(--color-accent-yellow)] border-transparent",
                                            isActive && isPeak && "bg-gradient-to-r from-[#cc3333] via-accent-red to-[#cc3333] shadow-[0_0_8px_var(--color-accent-red)] border-transparent",
                                            "landscape:min-h-[4px]"
                                        )} 
                                    />
                                );
                            })}
                        </div>
                        <div className="flex-1 w-full min-w-[60px] max-w-[68px] bg-gradient-to-b from-[#3a3a3a] via-bg-dark via-bg-darker via-bg-dark to-[#3a3a3a] rounded-md relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.6),inset_0_0_20px_rgba(0,0,0,0.4)] flex items-center justify-center border border-white/10 overflow-hidden max-xl:min-w-[52px] max-xl:max-w-[58px] landscape:min-w-[44px] landscape:max-w-[50px]">
                            <VerticalSlider
                                value={deckBState.volume}
                                min={0}
                                max={150}
                                onChange={(val) => onVolumeChange('B', val)}
                                label=""
                                showValue={false}
                                color="#00d4ff"
                                className="w-full h-full flex flex-col items-center py-2"
                            />
                        </div>
                    </div>
                </div>

                {/* Crossfader section */}
                <div className="w-full flex flex-col gap-2 px-4 py-2.5 bg-black/30 rounded-lg shrink-0 max-xl:px-2 max-xl:py-2">
                    <HorizontalSlider
                        value={crossfaderValue}
                        min={0}
                        max={100}
                        onChange={onCrossfaderChange}
                        color="#ffffff"
                        height={42}
                        thumbWidth={62}
                        showValue={false}
                        className="w-full"
                        showCenterLine={true}
                    />
                </div>

                {/* Inline EQ - visible on md+ screens */}
                <div className="hidden md:flex flex-col w-full gap-1.5 px-2 py-2 bg-black/30 rounded-lg shrink-0">
                    <div className="text-[9px] font-bold text-white/40 tracking-widest text-center uppercase">EQ</div>
                    <div className="flex gap-2">
                        {[
                            { deckId: 'A' as const, state: deckAState, color: '#ff0080' },
                            { deckId: 'B' as const, state: deckBState, color: '#00d4ff' },
                        ].map(({ deckId, state, color }) => (
                            <div key={deckId} className="flex-1 flex flex-col gap-0.5">
                                <div className="text-[8px] font-bold text-center" style={{ color }}>D{deckId}</div>
                                {(['low', 'mid', 'high'] as const).map(band => (
                                    <HorizontalSlider
                                        key={band}
                                        value={state.eq[band]}
                                        min={0}
                                        max={100}
                                        onChange={(val) => onEQChange(deckId, band, val)}
                                        height={8}
                                        thumbWidth={14}
                                        showValue={false}
                                        color={color}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mixer & EQ Popup Modal */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/60 backdrop-blur-md z-[9500] hidden items-center justify-center p-5",
                    isEQPopupOpen && "flex animate-[popup-fade-in_0.2s_ease-out_forwards]"
                )}
                onClick={(e) => e.target === e.currentTarget && setIsEQPopupOpen(false)}
            >
                <div className="bg-gradient-to-br from-bg-control to-bg-darkest border border-white/15 border-t-white/25 rounded-2xl w-full max-w-[480px] max-h-[85vh] overflow-hidden shadow-[0_25px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(0,0,0,0.5)] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                        <h4 className="text-base font-bold text-white m-0 tracking-tight uppercase">Mixer & EQ</h4>
                        <button
                            className="w-8 h-8 rounded-full bg-white/10 border-none text-[#ccc] flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-accent-red hover:text-white hover:rotate-90"
                            onClick={() => setIsEQPopupOpen(false)}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="p-2.5 overflow-y-auto flex flex-col gap-6">
                        {/* EQ Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {renderEQControls('A', deckAState, '#ff0080')}
                            {renderEQControls('B', deckBState, '#00d4ff')}
                        </div>

                        {/* EQ Actions */}
                        <div className="flex gap-3 px-2 pb-3">
                            <button
                                className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white/60 text-[11px] font-bold tracking-widest rounded-lg hover:bg-white/10 hover:text-white transition-all uppercase"
                                onClick={() => {
                                    onEQChange('A', 'low', 50);
                                    onEQChange('A', 'mid', 50);
                                    onEQChange('A', 'high', 50);
                                    onEQChange('B', 'low', 50);
                                    onEQChange('B', 'mid', 50);
                                    onEQChange('B', 'high', 50);
                                }}
                            >
                                RESET
                            </button>
                            <button
                                className="flex-1 py-2.5 bg-gradient-to-r from-deck-a to-deck-b text-white text-[11px] font-bold tracking-widest rounded-lg hover:brightness-110 transition-all uppercase"
                                onClick={() => setIsEQPopupOpen(false)}
                            >
                                APPLY
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
