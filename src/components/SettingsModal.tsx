import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { getKeyLabel } from '../utils/keyHelpers';
import { cn } from '../utils/cn';
import { sharedStyles } from '../utils/sharedStyles';

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
    const { user, isAuthenticated, googleLogin, logout } = useAuth();
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
        <div className={cn(sharedStyles.modalOverlay, "landscape:items-start landscape:pt-[max(8px,env(safe-area-inset-top))] landscape:pb-[max(8px,env(safe-area-inset-bottom))] landscape:pl-[max(8px,env(safe-area-inset-left))] landscape:pr-[max(8px,env(safe-area-inset-right))]")} onClick={onClose}>
            <div className={cn(sharedStyles.modalBase, "max-w-[90vw] max-h-[85vh] w-[400px] max-md:w-[95vw] max-md:max-h-[90vh] landscape:w-full landscape:max-w-[380px] landscape:max-h-[95vh] landscape:mx-auto landscape-sm:max-h-[98vh]")} onClick={e => e.stopPropagation()}>
                <header className={sharedStyles.modalHeader}>
                    <h2 className="text-base font-bold text-white m-0">Settings</h2>
                    <button className={sharedStyles.iconBtnClose} onClick={onClose}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </header>

                <div className="p-5 overflow-y-auto max-h-[calc(85vh-60px)] max-md:p-4 max-md:max-h-[calc(90vh-60px)] landscape:p-2.5 landscape:max-h-[calc(95vh-50px)] landscape-sm:p-2 landscape-sm:max-h-[calc(98vh-40px)]">
                    <div className="mb-5 landscape:mb-3">
                        <h3 className="text-[12px] font-bold text-text-hint uppercase tracking-widest mb-3 landscape:text-[10px] landscape:mb-2">Account</h3>
                        {isAuthenticated && user ? (
                            <div className="flex flex-col gap-2 p-3 bg-bg-control-dark border border-white/10 rounded-md">
                                <span className="text-sm text-white">Logged in as {user.email}</span>
                                <button onClick={logout} className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-sm hover:bg-red-500/30 transition">Logout</button>
                            </div>
                        ) : (
                            <div className="flex justify-center p-2 bg-bg-control-dark border border-white/10 rounded-md">
                                <GoogleLogin 
                                    onSuccess={res => { if(res.credential) googleLogin(res.credential) }}
                                    onError={() => console.error('Google Login Failed')}
                                />
                            </div>
                        )}
                    </div>

                    <div className="mb-5 landscape:mb-3">
                        <h3 className="text-[12px] font-bold text-text-hint uppercase tracking-widest mb-3 landscape:text-[10px] landscape:mb-2">Keyboard Layout</h3>
                        <div className="flex gap-3 landscape:gap-2 mt-2">
                            <button
                                className={cn(
                                    "flex-1 p-2.5 bg-bg-control-dark border border-white/10 rounded-md text-text-light font-semibold cursor-pointer transition-all duration-150 landscape:py-1.5 landscape:px-3 landscape:text-[11px]",
                                    layout === 'qwerty' && "bg-deck-a text-white border-transparent"
                                )}
                                onClick={() => setLayout('qwerty')}
                            >QWERTY</button>
                            <button
                                className={cn(
                                    "flex-1 p-2.5 bg-bg-control-dark border border-white/10 rounded-md text-text-light font-semibold cursor-pointer transition-all duration-150 landscape:py-1.5 landscape:px-3 landscape:text-[11px]",
                                    layout === 'azerty' && "bg-deck-a text-white border-transparent"
                                )}
                                onClick={() => setLayout('azerty')}
                            >AZERTY</button>
                        </div>
                    </div>

                    <h3 className="text-[12px] font-bold text-text-hint uppercase tracking-widest mb-3 landscape:text-[10px] landscape:mb-2">Keyboard Shortcuts</h3>
                    <p className="text-[13px] text-text-hint mb-4 landscape:text-[11px] landscape:mb-2">Click a button below and press a key to remap.</p>

                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 landscape:gap-1">
                        {Object.entries(ACTION_LABELS).map(([actionId, label]) => (
                            <div key={actionId} className="flex items-center justify-between py-2 border-b border-white/5 landscape:py-1.5 landscape:flex-wrap landscape:gap-1">
                                <span className="text-[13px] text-text-secondary landscape:text-[11px] landscape:flex-1 landscape:min-w-[120px] landscape-sm:text-[10px]">{label}</span>
                                <button
                                    className={cn(
                                        "min-w-[100px] px-3 py-1.5 bg-bg-header border border-white/10 rounded-sm text-deck-b font-mono font-bold cursor-pointer landscape:py-1 landscape:px-2.5 landscape:text-[10px] landscape:min-w-[70px] landscape-sm:py-0.5 landscape-sm:px-2 landscape-sm:text-[9px]",
                                        listeningFor === actionId && "border-deck-a text-deck-a animate-[settings-pulse_1s_infinite]"
                                    )}
                                    onClick={() => setListeningFor(actionId)}
                                >
                                    {listeningFor === actionId ? 'Press Key...' :
                                        (keyMap[actionId] ? getKeyLabel(keyMap[actionId], layout) : 'Unmapped')
                                    }
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 flex justify-center landscape:mt-2.5">
                        <button className="px-5 py-2.5 bg-transparent border border-white/30 rounded-full text-text-hint text-[13px] cursor-pointer transition-all duration-150 hover:border-white/50 hover:text-white landscape:py-2 landscape:px-4 landscape:text-[11px]" onClick={resetToDefaults}>Reset to Defaults</button>
                    </div>

                    <div className="mt-5 pt-2.5 border-top border-white/10 text-center text-white/40 text-[0.8rem] landscape:mt-2.5 landscape:pt-2 landscape:text-[10px]">
                        <span>Version: {localStorage.getItem('app_version') || 'Development Build'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
