export interface Track {
    id: string;
    name: string;
    duration: number;
    url: string;
    bpm?: number;
    file?: File;
}

// Deck State Interface
export interface DeckState {
    track: Track | null;
    isPlaying: boolean;
    isLoading: boolean;
    currentTime: number;
    pitch: number;
    volume: number;
    eq: {
        low: number;
        mid: number;
        high: number;
    };
    activeLoop: {
        start: number;
        end: number;
        active: boolean;
    } | null;
    cuePoints: number[];
    activeEffects: {
        reverb: boolean;
        delay: boolean;
        filter: boolean;
        distortion: boolean;
        bitcrusher: boolean;
        flanger: boolean;
        tremolo: boolean;
        hpf: boolean;
    };
}

export interface EffectState {
    reverb: number;
    delay: number;
    filter: number;
    enabled: boolean;
}

export type ActionIdentifier =
    | 'DECK_A_PLAY'
    | 'DECK_A_CUE'
    | 'DECK_B_PLAY'
    | 'DECK_B_CUE'
    | 'VOLUME_A_UP'
    | 'VOLUME_A_DOWN'
    | 'VOLUME_B_UP'
    | 'VOLUME_B_DOWN'
    | 'CROSSFADER_LEFT'
    | 'CROSSFADER_RIGHT'
    | 'EFFECT_A_TOGGLE'
    | 'EFFECT_B_TOGGLE'

export interface KeyMap {
    [actionId: string]: string; // Key code (e.g., 'KeyA', 'Space')
}

export const DEFAULT_KEY_MAP: KeyMap = {
    'DECK_A_PLAY': 'KeyQ',
    'DECK_A_CUE': 'KeyW',
    'DECK_B_PLAY': 'KeyP',
    'DECK_B_CUE': 'KeyO',
    'VOLUME_A_UP': 'KeyA',
    'VOLUME_A_DOWN': 'KeyZ',
    'VOLUME_B_UP': 'Quote',
    'VOLUME_B_DOWN': 'Slash',
    'CROSSFADER_LEFT': 'ArrowLeft',
    'CROSSFADER_RIGHT': 'ArrowRight',
    'EFFECT_A_TOGGLE': 'KeyE',
    'EFFECT_B_TOGGLE': 'KeyI',
};
