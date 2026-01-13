import React from 'react';
import './Mixer.css';

interface MixerProps {
    crossfaderValue: number;
    onCrossfaderChange: (value: number) => void;
    masterVolume: number;
    onMasterVolumeChange: (value: number) => void;
}

export const Mixer: React.FC<MixerProps> = ({
    crossfaderValue,
    onCrossfaderChange,
    masterVolume,
    onMasterVolumeChange
}) => {
    return (
        <div className="mixer glass-panel">
            <h3 className="mixer-title">Mixer</h3>

            <div className="crossfader-section">
                <div className="crossfader-labels">
                    <span className="deck-a-label">DECK A</span>
                    <span className="deck-b-label">DECK B</span>
                </div>
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
            </div>

            <div className="master-volume-section">
                <label className="control-label">
                    Master Volume
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
                    {Array.from({ length: 20 }, (_, i) => (
                        <div
                            key={i}
                            className={`volume-bar ${i < (masterVolume / 100) * 20 ? 'active' : ''
                                } ${i >= 16 ? 'red' : i >= 12 ? 'yellow' : 'green'}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
