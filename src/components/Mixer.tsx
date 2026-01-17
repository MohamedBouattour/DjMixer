import React from 'react';
import type { DeckState } from '../types';
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
    const renderDeckControls = (deckId: 'A' | 'B', state: DeckState) => {
        const { volume, eq, isPlaying } = state;
        const color = deckId === 'A' ? '#ff0080' : '#00d4ff';

        return (
            <div className={`mixer-deck-controls deck-${deckId.toLowerCase()}`} style={{ '--deck-color': color } as React.CSSProperties}>
                <div className="volume-section">
                    <div className="volume-control">
                        <label className="control-label">
                            VOL
                            {((deckId === 'A' && shortcuts?.volumeA) || (deckId === 'B' && shortcuts?.volumeB)) && (
                                <span className="shortcut-group">
                                    {(deckId === 'A' ? shortcuts?.volumeA?.up : shortcuts?.volumeB?.up) && (
                                        <span className="shortcut-badge tiny">{deckId === 'A' ? shortcuts?.volumeA?.up : shortcuts?.volumeB?.up}</span>
                                    )}
                                    {(deckId === 'A' ? shortcuts?.volumeA?.down : shortcuts?.volumeB?.down) && (
                                        <span className="shortcut-badge tiny">{deckId === 'A' ? shortcuts?.volumeA?.down : shortcuts?.volumeB?.down}</span>
                                    )}
                                </span>
                            )}
                            <span className="volume-value">{Math.round(volume)}%</span>
                        </label>
                        <div className="volume-slider-container">
                            <div className="fader-track"></div>
                            <input
                                type="range"
                                min="0"
                                max="150"
                                value={volume}
                                onChange={(e) => onVolumeChange(deckId, parseFloat(e.target.value))}
                                className="volume-slider"
                            />
                            <div className="volume-level-indicator">
                                <div
                                    className="volume-level-fill"
                                    style={{
                                        height: `${(volume / 150) * 100}%`,
                                        background: `linear-gradient(to top, ${color}, var(--color-accent-green))`
                                    }}
                                />
                            </div>
                        </div>
                    </div>

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

                <div className="eq-controls">
                    {(['high', 'mid', 'low'] as const).map((band) => (
                        <div key={band} className="eq-band">
                            <label className="control-label text-xs">{band.toUpperCase()}</label>
                            <div className="eq-slider-wrapper">
                                <div className="fader-track mini"></div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={eq[band]}
                                    onChange={(e) => onEQChange(deckId, band, parseFloat(e.target.value))}
                                    className="eq-slider"
                                />
                                <div className="eq-level-indicator">
                                    <div
                                        className="eq-level-fill"
                                        style={{
                                            height: `${eq[band]}%`,
                                            background: `linear-gradient(to top, rgba(255, 255, 255, 0.05), ${color})`
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="mixer glass-panel">
            <h3 className="mixer-title">Mixer</h3>

            <div className="mixer-layout">
                {renderDeckControls('A', deckAState)}

                <div className="mixer-center">
                    <div className="master-volume-section">
                        <label className="control-label">
                            MASTER
                            <span className="volume-value">{Math.round(masterVolume)}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={masterVolume}
                            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
                            className="master-volume-slider"
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

                    <div className="crossfader-section">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={crossfaderValue}
                            onChange={(e) => onCrossfaderChange(parseFloat(e.target.value))}
                            className="crossfader"
                        />
                        <div className="crossfader-indicator">
                            <div
                                className="crossfader-position"
                                style={{ left: `${crossfaderValue}%` }}
                            />
                        </div>
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

                {renderDeckControls('B', deckBState)}
            </div>
        </div>
    );
};
