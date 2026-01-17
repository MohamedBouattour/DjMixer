
import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { DEFAULT_KEY_MAP, type KeyMap } from '../types';
import { saveKeyMapToDB, getKeyMapFromDB } from '../utils/storage';

interface SettingsContextType {
    keyMap: KeyMap;
    layout: 'qwerty' | 'azerty';
    updateKeyMapping: (actionId: string, key: string) => Promise<void>;
    resetToDefaults: () => Promise<void>;
    setLayout: (layout: 'qwerty' | 'azerty') => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [keyMap, setKeyMap] = useState<KeyMap>(DEFAULT_KEY_MAP);
    const [layout, setLayout] = useState<'qwerty' | 'azerty'>('qwerty');

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const savedMap = await getKeyMapFromDB();
                if (savedMap) {
                    // Merge with defaults to ensure any new keys added to the code are present
                    setKeyMap({ ...DEFAULT_KEY_MAP, ...savedMap });
                }
                const savedLayout = localStorage.getItem('keyboard_layout') as 'qwerty' | 'azerty';
                if (savedLayout) {
                    setLayout(savedLayout);
                } else {
                    // Auto-detect based on language (FR -> AZERTY)
                    const isFrench = navigator.language.startsWith('fr');
                    if (isFrench) {
                        setLayout('azerty');
                        localStorage.setItem('keyboard_layout', 'azerty');
                    }
                }
            } catch (error) {
                console.error("Failed to load settings:", error);
            }
        };
        loadSettings();
    }, []);

    const handleSetLayout = (newLayout: 'qwerty' | 'azerty') => {
        setLayout(newLayout);
        localStorage.setItem('keyboard_layout', newLayout);
    };

    const updateKeyMapping = async (actionId: string, key: string) => {
        // Remove any existing action bound to this key to prevent conflicts?
        // Or just map it.
        // Usually, if I press 'A' for Play, and 'A' was Volume Up, Volume Up should probably be unmapped or checked.
        // For now, let's just do a direct update. The UI should handle conflict detection if needed.

        // Actually, let's do a cleanup: if another action uses this key, unmap it? 
        // Or better, let the user decide. Simplest: overwrite.
        // If we overwrite, we might have two actions with same key if we are not careful.
        // But our structure is { Action: Key }. 
        // So multiple Actions MIGHT have the same Key.
        // We probably want to avoid that.

        const newMap = { ...keyMap };

        // Check if key is used by another action
        for (const [act, k] of Object.entries(newMap)) {
            if (k === key && act !== actionId) {
                // Clear the old action's key or just keep it? 
                // Let's clear it to avoid ambiguity
                newMap[act] = '';
            }
        }

        newMap[actionId] = key;

        setKeyMap(newMap);
        await saveKeyMapToDB(newMap);
    };

    const resetToDefaults = async () => {
        setKeyMap(DEFAULT_KEY_MAP);
        await saveKeyMapToDB(DEFAULT_KEY_MAP);
    }

    return (
        <SettingsContext.Provider value={{ keyMap, layout, updateKeyMapping, resetToDefaults, setLayout: handleSetLayout }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
