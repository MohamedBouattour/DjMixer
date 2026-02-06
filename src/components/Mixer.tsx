import React, { useState } from 'react';
import type { DeckState } from '../types';
import VerticalSlider from './VerticalSlider';
import './Mixer.css';

interface MixerProps {
    crossfaderValue: number;
    onCrossfaderChange: (value: number) => void;
    deckAState: DeckState;
    deckBState: DeckState;
    onVolumeChange: (deck: 'A' | 'B', value: number) => void;
    onEQChange: (deck: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number) => void;
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
    onEQChange
}) => {
    const [isEQPopupOpen, setIsEQPopupOpen] = useState(false);

    const renderEQControls = (deckId: 'A' | 'B', state: DeckState, color: string) => {
        const { eq } = state;
        return (
            <div className="eq-controls-popup-deck" style={{ '--deck-color': color } as React.CSSProperties}>
                <div className="effects-deck-label" style={{ background: color }}>DECK {deckId}</div>
                <div className="eq-controls-row">
                    {(['high', 'mid', 'low'] as const).map((band) => (
                        <VerticalSlider
                            key={band}
                            value={eq[band]}
                            min={0}
                            max={100}
                            onChange={(val) => onEQChange(deckId, band, val)}
                            label={band.toUpperCase()}
                            showValue={false}
                            color={color}
                            height={100}
                            className="eq-slider-vertical compact"
                        />
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
            <div className="mixer glass-panel">
                {/* Top row: VOL labels with settings gear in center and library on right */}
                <div className="mixer-header-row">
                    <span className="vol-label deck-a">VOL</span>
                    <span className="vol-label deck-b">VOL</span>
                </div>

                {/* Main faders section - Side by side volume sliders with VU meters */}
                <div className="mixer-faders-section">
                    {/* Deck A: Slider + VU */}
                    <div className="fader-column">
                        <div className="volume-slider-container">
                            <VerticalSlider
                                value={deckAState.volume}
                                min={0}
                                max={150}
                                onChange={(val) => onVolumeChange('A', val)}
                                label=""
                                showValue={false}
                                color="#ff0080"
                                className="volume-slider-vertical"
                            />
                        </div>
                        <div className="vu-meter">
                            {Array.from({ length: 12 }).map((_, i) => {
                                const segmentIndex = i;
                                const isActive = segmentIndex < vuLevelA;
                                const isPeak = segmentIndex >= 10;
                                const isHigh = segmentIndex >= 8;
                                return (
                                    <div key={i} className={`vu-segment ${isActive ? 'active' : ''} ${isPeak ? 'peak' : isHigh ? 'high' : ''}`} />
                                );
                            })}
                        </div>
                    </div>

                    {/* Center: MIX label and volume percentages */}
                    <div className="mix-center">
                        <span className="volume-percent deck-a-percent">{Math.round(deckAState.volume)}%</span>
                        <button
                            className="mix-label-btn"
                            onClick={() => setIsEQPopupOpen(true)}
                            title="Open Mixer & EQ Settings"
                        >
                            MIX
                        </button>
                        <span className="volume-percent deck-b-percent">{Math.round(deckBState.volume)}%</span>
                    </div>

                    {/* Deck B: VU + Slider */}
                    <div className="fader-column">
                        <div className="vu-meter">
                            {Array.from({ length: 12 }).map((_, i) => {
                                const segmentIndex = i;
                                const isActive = segmentIndex < vuLevelB;
                                const isPeak = segmentIndex >= 10;
                                const isHigh = segmentIndex >= 8;
                                return (
                                    <div key={i} className={`vu-segment ${isActive ? 'active' : ''} ${isPeak ? 'peak' : isHigh ? 'high' : ''}`} />
                                );
                            })}
                        </div>
                        <div className="volume-slider-container">
                            <VerticalSlider
                                value={deckBState.volume}
                                min={0}
                                max={150}
                                onChange={(val) => onVolumeChange('B', val)}
                                label=""
                                showValue={false}
                                color="#00d4ff"
                                className="volume-slider-vertical"
                            />
                        </div>
                    </div>
                </div>

                {/* Crossfader section */}
                <div className="crossfader-section">
                    <input
                        type="range"
                        className="crossfader"
                        min="0"
                        max="100"
                        value={crossfaderValue}
                        onChange={(e) => onCrossfaderChange(Number(e.target.value))}
                    />
                </div>
            </div>

            {/* Mixer & EQ Popup Modal */}
            <div
                className={`advanced-controls-popup ${isEQPopupOpen ? 'open' : ''}`}
                onClick={(e) => e.target === e.currentTarget && setIsEQPopupOpen(false)}
            >
                <div className="advanced-controls-content large-popup">
                    <div className="advanced-controls-header">
                        <h4 className="advanced-controls-title">Mixer & EQ</h4>
                        <button
                            className="advanced-controls-close"
                            onClick={() => setIsEQPopupOpen(false)}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="popup-main-content">
                        {/* EQ Grid */}
                        <div className="eq-popup-grid">
                            {renderEQControls('A', deckAState, '#ff0080')}
                            {renderEQControls('B', deckBState, '#00d4ff')}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
