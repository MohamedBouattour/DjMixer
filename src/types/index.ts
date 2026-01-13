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
    currentTime: number;
    pitch: number;
    volume: number;
    eq: {
        low: number;
        mid: number;
        high: number;
    };
}

export interface EffectState {
    reverb: number;
    delay: number;
    filter: number;
    enabled: boolean;
}
