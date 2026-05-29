export interface Track {
    id: string;
    name: string;
    duration: number;
    url: string;
    bpm?: number;
    file?: File;
    artist?: string;
    genre?: string;
    thumbnail?: string;
}

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
    cuePoints: (number | undefined)[];
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
    [actionId: string]: string;
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

export interface SmartSuggestion {
    id: string;
    title: string;
    artist: string;
    genre: string;
    bpm: number;
    reason: string;
    status: 'pending' | 'found' | 'not_found';
    thumbnail?: string;
    duration?: number;
    videoId?: string;
    isDiverse?: boolean;
}

export interface SmartMixQueueItem {
    id: string;
    track: Track;
    suggestion?: SmartSuggestion;
}

export type SmartMixPhase =
    | 'IDLE'
    | 'FETCHING'
    | 'AWAITING_CHOICE'
    | 'LOADING'
    | 'LOOPING'
    | 'TRANSITIONING'
    | 'COOLDOWN';
