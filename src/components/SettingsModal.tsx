
import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { getKeyLabel } from '../utils/keyHelpers';

import './SettingsModal.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
    'DECK_A_PLAY': 'Deck A Play/Pause',
    'DECK_A_CUE': 'Deck A Cue',
    'DECK_B_PLAY': 'Deck B Play/Pause',
    'DECK_B_CUE': 'Deck B Cue',
    'VOLUME_A_UP': 'Deck A Volume Up',
    'VOLUME_A_DOWN': 'Deck A Volume Down',
    'VOLUME_B_UP': 'Deck B Volume Up',
    'VOLUME_B_DOWN': 'Deck B Volume Down',
    'CROSSFADER_LEFT': 'Crossfader Left',
    'CROSSFADER_RIGHT': 'Crossfader Right',
    'EFFECT_A_TOGGLE': 'Deck A Effect Toggle',
    'EFFECT_B_TOGGLE': 'Deck B Effect Toggle',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { keyMap, updateKeyMapping, resetToDefaults, layout, setLayout } = useSettings();
    const [listeningFor, setListeningFor] = useState<string | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (listeningFor) {
                e.preventDefault();
                e.stopPropagation(); // Stop global listener
                updateKeyMapping(listeningFor, e.code);
                setListeningFor(null);
            } else if (e.code === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, listeningFor, updateKeyMapping, onClose]);

    if (!isOpen) return null;

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <header className="settings-header">
                    <h2>Settings</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </header>

                <div className="settings-content">
                    <div className="settings-section">
                        <h3>Keyboard Layout</h3>
                        <div className="layout-selector">
                            <button
                                className={`layout-btn ${layout === 'qwerty' ? 'active' : ''}`}
                                onClick={() => setLayout('qwerty')}
                            >QWERTY</button>
                            <button
                                className={`layout-btn ${layout === 'azerty' ? 'active' : ''}`}
                                onClick={() => setLayout('azerty')}
                            >AZERTY</button>
                        </div>
                    </div>

                    <h3>Keyboard Shortcuts</h3>
                    <p className="settings-hint">Click a button below and press a key to remap.</p>

                    <div className="key-mapping-list">
                        {Object.entries(ACTION_LABELS).map(([actionId, label]) => (
                            <div key={actionId} className="key-mapping-item">
                                <span className="action-label">{label}</span>
                                <button
                                    className={`key-btn ${listeningFor === actionId ? 'listening' : ''}`}
                                    onClick={() => setListeningFor(actionId)}
                                >
                                    {listeningFor === actionId ? 'Press Key...' :
                                        (keyMap[actionId] ? getKeyLabel(keyMap[actionId], layout) : 'Unmapped')
                                    }
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="settings-actions">
                        <button className="reset-btn" onClick={resetToDefaults}>Reset to Defaults</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
