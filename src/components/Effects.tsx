import React, { useState } from 'react';
import './Effects.css';

interface EffectsProps {
    onEffectChange: (deck: 'A' | 'B', effect: 'reverb' | 'delay' | 'filter', value: number) => void;
}

export const Effects: React.FC<EffectsProps> = ({ onEffectChange }) => {
    const [deckAEffects, setDeckAEffects] = useState({
        reverb: 0,
        delay: 0,
        filter: 100
    });

    const [deckBEffects, setDeckBEffects] = useState({
        reverb: 0,
        delay: 0,
        filter: 100
    });

    const [isEffectsPopupOpen, setIsEffectsPopupOpen] = useState(false);

    const handleEffectChange = (
        deck: 'A' | 'B',
        effect: 'reverb' | 'delay' | 'filter',
        value: number
    ) => {
        if (deck === 'A') {
            setDeckAEffects(prev => ({ ...prev, [effect]: value }));
        } else {
            setDeckBEffects(prev => ({ ...prev, [effect]: value }));
        }
        onEffectChange(deck, effect, value);
    };

    const renderEffectsContent = (inPopup = false) => (
        <div className={`effects-content ${inPopup ? 'in-popup' : ''}`}>
            <div className="effects-grid">
                <div className="effects-deck">
                    <div className="effects-deck-label deck-a-label">DECK A</div>

                    <div className="effect-control">
                        <label className="effect-label">
                            Reverb
                            <span className="effect-value">{deckAEffects.reverb}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckAEffects.reverb}
                            onChange={(e) => handleEffectChange('A', 'reverb', parseFloat(e.target.value))}
                            className="effect-slider"
                        />
                    </div>

                    <div className="effect-control">
                        <label className="effect-label">
                            Delay
                            <span className="effect-value">{deckAEffects.delay}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckAEffects.delay}
                            onChange={(e) => handleEffectChange('A', 'delay', parseFloat(e.target.value))}
                            className="effect-slider"
                        />
                    </div>

                    <div className="effect-control">
                        <label className="effect-label">
                            Filter
                            <span className="effect-value">{deckAEffects.filter}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckAEffects.filter}
                            onChange={(e) => handleEffectChange('A', 'filter', parseFloat(e.target.value))}
                            className="effect-slider"
                        />
                    </div>
                </div>

                <div className="effects-deck">
                    <div className="effects-deck-label deck-b-label">DECK B</div>

                    <div className="effect-control">
                        <label className="effect-label">
                            Reverb
                            <span className="effect-value">{deckBEffects.reverb}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckBEffects.reverb}
                            onChange={(e) => handleEffectChange('B', 'reverb', parseFloat(e.target.value))}
                            className="effect-slider"
                        />
                    </div>

                    <div className="effect-control">
                        <label className="effect-label">
                            Delay
                            <span className="effect-value">{deckBEffects.delay}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckBEffects.delay}
                            onChange={(e) => handleEffectChange('B', 'delay', parseFloat(e.target.value))}
                            className="effect-slider"
                        />
                    </div>

                    <div className="effect-control">
                        <label className="effect-label">
                            Filter
                            <span className="effect-value">{deckBEffects.filter}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckBEffects.filter}
                            onChange={(e) => handleEffectChange('B', 'filter', parseFloat(e.target.value))}
                            className="effect-slider"
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Main Effects Panel - Hidden on tablet */}
            <div className="effects glass-panel">
                <h3 className="effects-title">Effects</h3>
                {renderEffectsContent()}
            </div>

            {/* Effects Toggle Button - Only shown on tablet */}
            <button
                className="effects-toggle-btn"
                onClick={() => setIsEffectsPopupOpen(true)}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v8M8 12h8" />
                </svg>
                Effects
            </button>

            {/* Effects Popup Modal - Only shown on tablet */}
            <div
                className={`advanced-controls-popup ${isEffectsPopupOpen ? 'open' : ''}`}
                onClick={(e) => e.target === e.currentTarget && setIsEffectsPopupOpen(false)}
            >
                <div className="advanced-controls-content">
                    <div className="advanced-controls-header">
                        <h4 className="advanced-controls-title">Effects Controls</h4>
                        <button
                            className="advanced-controls-close"
                            onClick={() => setIsEffectsPopupOpen(false)}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {renderEffectsContent(true)}
                </div>
            </div>
        </>
    );
};
