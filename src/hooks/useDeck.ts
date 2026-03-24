import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
    const isScratchingRef = useRef(false);
    const activeLoopRef = useRef<{ start: number; end: number; active: boolean } | null>(null);
    
    // ✅ Bug B Fix: Stabilize endScratch with pitchRef
    const pitchRef = useRef(state.pitch);
    useEffect(() => {
        pitchRef.current = state.pitch;
    }, [state.pitch]);

    // Ref for the update function to avoid circular dependency in useCallback
    const updateCurrentTimeRef = useRef<() => void>(() => { });

    // ✅ Bug A Fix: Reliable setup when audioContext/destination becomes available
    useEffect(() => {
        if (!audioContext || !destination) return;

        // Cleanup previous if exists
        if (gainNodeRef.current) gainNodeRef.current.disconnect();
        if (effectsRef.current) effectsRef.current.disconnect();

        // Create gain node
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.gain.value = state.volume / 100;

        // Create effects chain
        effectsRef.current = new AudioEffects(audioContext);
        effectsRef.current.connectToDestination(gainNodeRef.current);
        gainNodeRef.current.connect(destination);

        // If we already have an audio element, reconnect it
        if (audioElementRef.current && !sourceNodeRef.current) {
            sourceNodeRef.current = audioContext.createMediaElementSource(audioElementRef.current);
            effectsRef.current.connect(sourceNodeRef.current);
        } else if (audioElementRef.current && sourceNodeRef.current) {
            // Reconnect existing source to new effects chain
            effectsRef.current.connect(sourceNodeRef.current);
        }

        return () => {
            if (gainNodeRef.current) gainNodeRef.current.disconnect();
            if (effectsRef.current) effectsRef.current.disconnect();
        };
    }, [audioContext, destination]);

    // ✅ Bug D Fix: updateCurrentTime continues while paused
    const updateCurrentTime = useCallback(() => {
        if (audioElementRef.current) {
            const ct = audioElementRef.current.currentTime;

            // Handle Loop
            if (activeLoopRef.current && activeLoopRef.current.active) {
                if (ct >= activeLoopRef.current.end) {
                    audioElementRef.current.currentTime = activeLoopRef.current.start;
                }
            }

            // Only update state if time actually changed significantly to avoid React spam
            setState(prev => prev.currentTime !== ct ? { ...prev, currentTime: ct } : prev);
        }
        
        // Always reschedule to keep seeking visual working while paused
        animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);
    }, []);

    // Keep ref updated
    updateCurrentTimeRef.current = updateCurrentTime;

    const loadTrack = useCallback(async (track: Track) => {
        setState(prev => ({ ...prev, isLoading: true }));

        // ✅ Bug E Fix: Revoke previous blob URL
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            if (audioElementRef.current.src.startsWith('blob:')) {
                URL.revokeObjectURL(audioElementRef.current.src);
            }
            if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
                sourceNodeRef.current = null;
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

        // Listen for track end
        audio.addEventListener('ended', () => {
            isPlayingRef.current = false;
            setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        });

        // Create source node and connect if context is available
        if (audioContext && destination && effectsRef.current) {
            sourceNodeRef.current = audioContext.createMediaElementSource(audio);
            effectsRef.current.connect(sourceNodeRef.current);
        }

        // Process audio buffer for BPM
        let bpm = track.bpm;

        if (!bpm) {
            try {
                let arrayBuffer: ArrayBuffer;
                if (track.file) {
                    arrayBuffer = await track.file.arrayBuffer();
                } else {
                    const response = await fetch(track.url);
                    arrayBuffer = await response.arrayBuffer();
                }
                const decodedBuffer = await (audioContext || new (window.AudioContext || (window as any).webkitAudioContext)()).decodeAudioData(arrayBuffer);
                bpm = await detectBPM(decodedBuffer);
            } catch (error) {
                console.error('BPM detection failed:', error);
                if (!bpm) bpm = 120;
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
        
        // Start time update loop even if paused
        if (!animationFrameRef.current) {
            animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);
        }
    }, [audioContext, destination]);

    const play = useCallback(async () => {
        if (audioElementRef.current) {
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            audioElementRef.current.play();
            isPlayingRef.current = true;
            setState(prev => ({ ...prev, isPlaying: true }));
        }
    }, [audioContext]);

    const pause = useCallback(() => {
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            isPlayingRef.current = false;
            setState(prev => ({ ...prev, isPlaying: false }));
        }
    }, []);

    const seek = useCallback((time: number) => {
        if (audioElementRef.current) {
            audioElementRef.current.currentTime = time;
            // ✅ Bug D: Immediate state update for visual playhead
            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, []);

    const setPitch = useCallback((update: number | ((prev: number) => number)) => {
        setState(prev => {
            const newPitch = typeof update === 'function' ? update(prev.pitch) : update;
            if (audioElementRef.current && !isScratchingRef.current) {
                const playbackRate = 1 + (newPitch / 100);
                audioElementRef.current.playbackRate = playbackRate;
            }
            return { ...prev, pitch: newPitch };
        });
    }, []);

    const startScratch = useCallback(() => {
        isScratchingRef.current = true;
        if (audioElementRef.current) {
            audioElementRef.current.playbackRate = 0;
        }
    }, []);

    // ✅ Bug B Fix: stable endScratch using pitchRef
    const endScratch = useCallback(() => {
        isScratchingRef.current = false;
        if (audioElementRef.current) {
            audioElementRef.current.playbackRate = 1 + (pitchRef.current / 100);
        }
    }, []);

    const setScratchRate = useCallback((rate: number) => {
        if (audioElementRef.current && isScratchingRef.current) {
            audioElementRef.current.playbackRate = Math.abs(rate);
        }
    }, []);

    const setVolume = useCallback((update: number | ((prev: number) => number)) => {
        setState(prev => {
            const newVolume = typeof update === 'function' ? update(prev.volume) : update;
            if (gainNodeRef.current) {
                gainNodeRef.current.gain.value = newVolume / 100;
            }
            return { ...prev, volume: newVolume };
        });
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
                case 'reverb': effectsRef.current.setReverb(value); break;
                case 'delay': effectsRef.current.setDelay(value); break;
                case 'filter': effectsRef.current.setFilter(value); break;
                case 'distortion': effectsRef.current.setDistortion(value); break;
                case 'bitcrusher': effectsRef.current.setBitcrusher(value); break;
                case 'flanger': effectsRef.current.setFlanger(value); break;
                case 'tremolo': effectsRef.current.setTremolo(value); break;
                case 'hpf': effectsRef.current.setHPF(value); break;
            }
        }
    }, []);

    const toggleEffect = useCallback((effect: 'reverb' | 'delay' | 'filter' | 'distortion' | 'bitcrusher' | 'flanger' | 'tremolo' | 'hpf') => {
        setState(prev => {
            const isActive = prev.activeEffects[effect];
            const newValue = !isActive;

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
                    case 'hpf': effectsRef.current.setHPF(newValue ? 40 : 0); break;
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
                if (audioElementRef.current) {
                    audioElementRef.current.currentTime = newCuePoints[index]!;
                }
                return prev;
            } else {
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
            newCues[index] = undefined;
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

    const controls = useMemo(() => ({
        loadTrack,
        play,
        pause,
        seek,
        setPitch,
        startScratch,
        endScratch,
        setScratchRate,
        setVolume,
        setEQ,
        setEffect,
        toggleEffect,
        handleCue,
        deleteCue,
        setLoop,
        clearLoop,
        setIsLoading
    }), [loadTrack, play, pause, seek, setPitch, startScratch, endScratch, setScratchRate, setVolume, setEQ, setEffect, toggleEffect, handleCue, deleteCue, setLoop, clearLoop, setIsLoading]);

    return {
        state,
        controls
    };
};
