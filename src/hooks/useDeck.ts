import { useState, useRef, useEffect, useCallback } from 'react';
import type { Track, DeckState } from '../types';
import { AudioEffects } from '../audio/AudioEffects';
import { detectBPM } from '../utils/audioUtils';

interface UseDeckOptions {
    audioContext: AudioContext;
    destination: AudioNode;
    deckId: 'A' | 'B';
}

export const useDeck = ({ audioContext, destination }: UseDeckOptions) => {
    const [state, setState] = useState<DeckState>({
        track: null,
        isPlaying: false,
        isLoading: false,
        currentTime: 0,
        pitch: 0,
        volume: 75,
        eq: { low: 50, mid: 50, high: 50 },
        activeLoop: null,
        cuePoints: [],
        activeEffects: {
            reverb: false,
            delay: false,
            filter: false,
            distortion: false,
            bitcrusher: false,
            flanger: false,
            tremolo: false,
            hpf: false
        }
    });

    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const effectsRef = useRef<AudioEffects | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);

    const isPlayingRef = useRef(false);
    const activeLoopRef = useRef<{ start: number; end: number; active: boolean } | null>(null);

    useEffect(() => {
        if (!audioContext || !destination) return;

        // Create gain node
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.gain.value = state.volume / 100;

        // Create effects chain
        effectsRef.current = new AudioEffects(audioContext);
        effectsRef.current.connectToDestination(gainNodeRef.current);
        gainNodeRef.current.connect(destination);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
            }
            if (effectsRef.current) {
                effectsRef.current.disconnect();
            }
            if (gainNodeRef.current) {
                gainNodeRef.current.disconnect();
            }
        };
    }, [audioContext, destination]);

    const updateCurrentTime = useCallback(() => {
        if (audioElementRef.current && isPlayingRef.current) {
            const currentTime = audioElementRef.current.currentTime;

            // Handle Loop
            if (activeLoopRef.current && activeLoopRef.current.active) {
                if (currentTime >= activeLoopRef.current.end) {
                    audioElementRef.current.currentTime = activeLoopRef.current.start;
                }
            }

            setState(prev => ({ ...prev, currentTime: audioElementRef.current!.currentTime }));
            animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
        }
    }, []);

    const loadTrack = useCallback(async (track: Track) => {
        setState(prev => ({ ...prev, isLoading: true }));

        // Stop current playback
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
            }
        }

        // Reset state
        isPlayingRef.current = false;
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        // Create new audio element
        const audio = new Audio(track.url);
        audio.crossOrigin = 'anonymous';
        audioElementRef.current = audio;

        // Create source node and connect
        sourceNodeRef.current = audioContext.createMediaElementSource(audio);
        if (effectsRef.current) {
            effectsRef.current.connect(sourceNodeRef.current);
        }

        // Detect BPM if not already set
        let bpm = track.bpm;
        if (!bpm) {
            try {
                // Fetch for BPM detection
                const response = await fetch(track.url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                bpm = await detectBPM(audioBuffer);
            } catch (error) {
                console.error('BPM detection failed:', error);
                bpm = 120;
            }
        }

        setState(prev => ({
            ...prev,
            track: { ...track, bpm },
            currentTime: 0,
            isPlaying: false,
            isLoading: false,
            activeLoop: null,
            cuePoints: []
        }));
        activeLoopRef.current = null;
    }, [audioContext]);

    const play = useCallback(async () => {
        if (audioElementRef.current) {
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            audioElementRef.current.play();
            isPlayingRef.current = true;
            setState(prev => ({ ...prev, isPlaying: true }));

            // Cancel any existing loop to prevent duplicates
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
        }
    }, [audioContext, updateCurrentTime]);

    const pause = useCallback(() => {
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            isPlayingRef.current = false;
            setState(prev => ({ ...prev, isPlaying: false }));
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        }
    }, []);

    const seek = useCallback((time: number) => {
        if (audioElementRef.current) {
            audioElementRef.current.currentTime = time;
            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, []);

    const setPitch = useCallback((pitch: number) => {
        if (audioElementRef.current) {
            // pitch range: -10 to +10
            const playbackRate = 1 + (pitch / 100);
            audioElementRef.current.playbackRate = playbackRate;
            setState(prev => ({ ...prev, pitch }));
        }
    }, []);

    const setVolume = useCallback((volume: number) => {
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = volume / 100;
            setState(prev => ({ ...prev, volume }));
        }
    }, []);

    const setEQ = useCallback((band: 'low' | 'mid' | 'high', value: number) => {
        if (effectsRef.current) {
            effectsRef.current.setEQ(band, value);
            setState(prev => ({
                ...prev,
                eq: { ...prev.eq, [band]: value }
            }));
        }
    }, []);

    const setEffect = useCallback((effect: 'reverb' | 'delay' | 'filter' | 'distortion' | 'bitcrusher' | 'flanger' | 'tremolo' | 'hpf', value: number) => {
        if (effectsRef.current) {
            switch (effect) {
                case 'reverb':
                    effectsRef.current.setReverb(value);
                    break;
                case 'delay':
                    effectsRef.current.setDelay(value);
                    break;
                case 'filter':
                    effectsRef.current.setFilter(value);
                    break;
                case 'distortion':
                    effectsRef.current.setDistortion(value);
                    break;
                case 'bitcrusher':
                    effectsRef.current.setBitcrusher(value);
                    break;
                case 'flanger':
                    effectsRef.current.setFlanger(value);
                    break;
                case 'tremolo':
                    effectsRef.current.setTremolo(value);
                    break;
                case 'hpf':
                    effectsRef.current.setHPF(value);
                    break;
            }
        }
    }, []);

    const toggleEffect = useCallback((effect: 'reverb' | 'delay' | 'filter' | 'distortion' | 'bitcrusher' | 'flanger' | 'tremolo' | 'hpf') => {
        setState(prev => {
            const isActive = prev.activeEffects[effect];
            const newValue = !isActive;

            // Apply effect immediately
            if (effectsRef.current) {
                const value = newValue ? (effect === 'distortion' || effect === 'bitcrusher' ? 20 : 50) : 0;
                switch (effect) {
                    case 'reverb': effectsRef.current.setReverb(value); break;
                    case 'delay': effectsRef.current.setDelay(value); break;
                    case 'filter': effectsRef.current.setFilter(newValue ? 20 : 100); break;
                    case 'distortion': effectsRef.current.setDistortion(value); break;
                    case 'bitcrusher': effectsRef.current.setBitcrusher(value); break;
                    case 'flanger': effectsRef.current.setFlanger(value); break;
                    case 'tremolo': effectsRef.current.setTremolo(value); break;
                    case 'hpf': effectsRef.current.setHPF(newValue ? 40 : 0); break; // 40 = ~4kHz? 
                }
            }

            return {
                ...prev,
                activeEffects: {
                    ...prev.activeEffects,
                    [effect]: newValue
                }
            };
        });
    }, []);

    const handleCue = useCallback((index: number) => {
        setState(prev => {
            const newCuePoints = [...prev.cuePoints];
            if (newCuePoints[index] !== undefined) {
                // Jump
                if (audioElementRef.current) {
                    audioElementRef.current.currentTime = newCuePoints[index];
                }
                return prev;
            } else {
                // Set
                if (audioElementRef.current) {
                    newCuePoints[index] = audioElementRef.current.currentTime;
                }
                return { ...prev, cuePoints: newCuePoints };
            }
        });
    }, []);

    const deleteCue = useCallback((index: number) => {
        setState(prev => {
            const newCues = [...prev.cuePoints];
            delete newCues[index]; // Use delete to keep index empty? Or filter?
            // Arrays usually fill with empty or undefined.
            // Let's just unset it.
            newCues[index] = undefined as any;
            return { ...prev, cuePoints: newCues };
        });
    }, []);

    const setLoop = useCallback((start: number, end: number) => {
        const loop = { start, end, active: true };
        activeLoopRef.current = loop;
        setState(prev => ({ ...prev, activeLoop: loop }));
    }, []);

    const clearLoop = useCallback(() => {
        activeLoopRef.current = null;
        setState(prev => ({ ...prev, activeLoop: null }));
    }, []);

    const setIsLoading = useCallback((isLoading: boolean) => {
        setState(prev => ({ ...prev, isLoading }));
    }, []);

    return {
        state,
        loadTrack,
        play,
        pause,
        seek,
        setPitch,
        setVolume,
        setEQ,
        setEffect,
        toggleEffect,
        handleCue,
        deleteCue,
        setLoop,
        clearLoop,
        setIsLoading
    };
};
