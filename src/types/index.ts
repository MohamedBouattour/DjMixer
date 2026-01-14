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
