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

    return (
        <div className="effects glass-panel">
            <h3 className="effects-title">Effects</h3>

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
};
