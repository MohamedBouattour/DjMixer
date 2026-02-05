import React, { useState } from 'react';
import type { DeckState } from '../types';
import HorizontalSlider from './HorizontalSlider';
import VerticalSlider from './VerticalSlider';
import './Mixer.css';

interface MixerProps {
    crossfaderValue: number;
    onCrossfaderChange: (value: number) => void;
    masterVolume: number;
    onMasterVolumeChange: (value: number) => void;
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
    masterVolume,
    onMasterVolumeChange,
    deckAState,
    deckBState,
    onVolumeChange,
    onEQChange,
    shortcuts
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

    const renderDeckControls = (deckId: 'A' | 'B', state: DeckState) => {
        const { volume, eq, isPlaying } = state;
        const color = deckId === 'A' ? '#ff0080' : '#00d4ff';

        return (
            <div className={`mixer-deck-controls deck-${deckId.toLowerCase()}`} style={{ '--deck-color': color } as React.CSSProperties}>
                <div className="volume-section">
                    <VerticalSlider
                        value={volume}
                        min={0}
                        max={150}
                        onChange={(val) => onVolumeChange(deckId, val)}
                        label="VOL"
                        showValue={true}
                        valueFormatter={(v) => `${Math.round(v)}%`}
                        color={color}
                        className="mixer-volume-slider"
                    />

                    <div className="vu-meter">
                        {Array.from({ length: 12 }).map((_, i) => {
                            // Simulate VU meter peaks when playing
                            const isActive = isPlaying && volume > 10 && (11 - i) < (volume / 150) * 12 * (0.8 + Math.random() * 0.4);
                            const isPeak = (11 - i) >= 10;
                            const isHigh = (11 - i) >= 8;

                            return (
                                <div
                                    key={i}
                                    className={`vu-segment ${isActive ? 'active' : ''} ${isPeak ? 'peak' : isHigh ? 'high' : ''}`}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* EQ Controls - Hidden on tablet, show button instead */}
                <div className="eq-controls">
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
                            className="eq-slider-vertical"
                        />
                    ))}
                </div>

            </div>
        );
    };

    return (
        <>
            <div className="mixer glass-panel">
                <h3 className="mixer-title">Mixer</h3>

                <div className="mixer-layout">
                    {renderDeckControls('A', deckAState)}

                    <div className="mixer-center compact-center" style={{
                        flex: '0 0 auto',
                        width: '60px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        paddingBottom: '10px'
                    }}>
                        {/* EQ / Mixer Settings Toggle Button */}
                        <button
                            className="eq-toggle-btn main-eq-btn"
                            onClick={() => setIsEQPopupOpen(true)}
                            title="Open Mixer & EQ"
                            style={{
                                width: '100%',
                                height: 'auto',
                                aspectRatio: '1/1',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                fontSize: '0.7rem',
                                letterSpacing: '1px',
                                padding: '8px',
                                borderRadius: '8px'
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
                            </svg>
                            <span style={{ marginTop: '4px', fontSize: '0.6rem' }}>MIX</span>
                        </button>
                    </div>

                    {renderDeckControls('B', deckBState)}
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
                        {/* Moved Master Volume */}
                        <div className="popup-section master-section" style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>MASTER VOLUME</label>
                            <div className="master-volume-section">
                                <HorizontalSlider
                                    value={masterVolume}
                                    min={0}
                                    max={100}
                                    onChange={onMasterVolumeChange}
                                    label="MASTER"
                                    valueFormatter={(v) => `${Math.round(v)}%`}
                                    color="var(--color-accent-green)"
                                    height={24}
                                    thumbWidth={24}
                                    className="master-volume-slider-container"
                                />
                                <div className="volume-bars">
                                    {Array.from({ length: 15 }, (_, i) => (
                                        <div
                                            key={i}
                                            className={`volume-bar ${i < (masterVolume / 100) * 15 ? 'active' : ''
                                                } ${i >= 12 ? 'red' : i >= 9 ? 'yellow' : 'green'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* EQ Grid */}
                        <div className="eq-popup-grid">
                            {renderEQControls('A', deckAState, '#ff0080')}
                            {renderEQControls('B', deckBState, '#00d4ff')}
                        </div>

                        {/* Moved Crossfader */}
                        <div className="popup-section crossfader-popup-section" style={{ marginTop: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>CROSSFADER</label>
                            <div className="crossfader-section">
                                <HorizontalSlider
                                    value={crossfaderValue}
                                    min={0}
                                    max={100}
                                    onChange={onCrossfaderChange}
                                    label=""
                                    showValue={false}
                                    color="#ffffff"
                                    height={32}
                                    thumbWidth={40}
                                    showCenterLine={true}
                                    className="crossfader-slider-container"
                                />

                                <div className="crossfader-labels">
                                    <span className="deck-a-label">
                                        A {shortcuts?.crossfader && <span className="shortcut-badge tiny">{shortcuts.crossfader.left}</span>}
                                    </span>
                                    <span className="deck-b-label">
                                        B {shortcuts?.crossfader && <span className="shortcut-badge tiny">{shortcuts.crossfader.right}</span>}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
