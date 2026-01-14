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
}

export const Mixer: React.FC<MixerProps> = ({
    crossfaderValue,
    onCrossfaderChange,
    masterVolume,
    onMasterVolumeChange,
    deckAState,
    deckBState,
    onVolumeChange,
    onEQChange
}) => {
    const renderDeckControls = (deckId: 'A' | 'B', state: DeckState) => {
        const { volume, eq } = state;
        const color = deckId === 'A' ? '#ff0080' : '#00d4ff';

        return (
            <div className={`mixer-deck-controls deck-${deckId.toLowerCase()}`}>
                <div className="volume-control">
                    <label className="control-label">
                        VOL
                        <span className="volume-value">{Math.round(volume)}%</span>
                    </label>
                    <div className="volume-slider-container">
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

                <div className="eq-controls">
                    {(['high', 'mid', 'low'] as const).map((band) => (
                        <div key={band} className="eq-band">
                            <label className="control-label text-xs">{band.toUpperCase()}</label>
                            <div className="eq-slider-wrapper">
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
                                            background: `linear-gradient(to top, rgba(255, 255, 255, 0.1), ${color})`
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
                            <span className="deck-a-label">A</span>
                            <span className="deck-b-label">B</span>
                        </div>
                    </div>
                </div>

                {renderDeckControls('B', deckBState)}
            </div>
        </div>
    );
};
