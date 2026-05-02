import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Track, DeckState } from '../types';
import { AudioEffects } from '../audio/AudioEffects';
import { detectBPM } from '../utils/audioUtils';

interface UseDeckOptions {
    audioContext: AudioContext;
    destination: AudioNode;
    deckId: 'A' | 'B';
    isWorkletReady: boolean;
}

export const useDeck = ({ audioContext, destination, isWorkletReady }: UseDeckOptions) => {
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

    const scratchNodeRef = useRef<AudioWorkletNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const effectsRef = useRef<AudioEffects | null>(null);

    const isPlayingRef = useRef(false);
    const isScratchingRef = useRef(false);
    const activeLoopRef = useRef<{ start: number; end: number; active: boolean } | null>(null);
    
    // Maintain pitch ref for stable Worklet parameter updates
    const pitchRef = useRef(state.pitch);
    useEffect(() => {
        pitchRef.current = state.pitch;
        if (scratchNodeRef.current && !isScratchingRef.current) {
            const playbackRateParam = scratchNodeRef.current.parameters.get('playbackRate');
            if (playbackRateParam) {
                playbackRateParam.value = isPlayingRef.current ? (1 + state.pitch / 100) : 0;
            }
        }
    }, [state.pitch]);

    // ✅ Reliable setup when audioContext/destination becomes available
    useEffect(() => {
        if (!audioContext || !destination || !isWorkletReady) return;

        // Cleanup previous if exists
        if (gainNodeRef.current) gainNodeRef.current.disconnect();
        if (effectsRef.current) effectsRef.current.disconnect();
        if (scratchNodeRef.current) scratchNodeRef.current.disconnect();

        // Create gain node
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.gain.value = state.volume / 100;

        // Create effects chain
        effectsRef.current = new AudioEffects(audioContext);
        effectsRef.current.connectToDestination(gainNodeRef.current);
        gainNodeRef.current.connect(destination);

        // Initialize Scratch Processor Node
        try {
            const scratchNode = new AudioWorkletNode(audioContext, 'scratch-processor');
            scratchNodeRef.current = scratchNode;
            
            // Connect scratch node to effects chain
            effectsRef.current.connect(scratchNode);

            // Listen for position sync from worklet
            scratchNode.port.onmessage = (event) => {
                if (event.data.type === 'position') {
                    const ct = event.data.position / audioContext.sampleRate;
                    
                    // Handle Loop
                    if (activeLoopRef.current && activeLoopRef.current.active) {
                        if (ct >= activeLoopRef.current.end) {
                            scratchNode.port.postMessage({ 
                                type: 'seek', 
                                position: activeLoopRef.current.start * audioContext.sampleRate 
                            });
                        }
                    }

                    // Throttle state updates for UI performance
                    setState(prev => {
                        // If difference is small, don't update state to avoid unnecessary re-renders
                        if (Math.abs(prev.currentTime - ct) < 0.05) return prev;
                        return { ...prev, currentTime: ct };
                    });
                }
            };
        } catch (e) {
            console.error('[useDeck] Failed to create AudioWorkletNode:', e);
        }

        return () => {
            if (gainNodeRef.current) gainNodeRef.current.disconnect();
            if (effectsRef.current) effectsRef.current.disconnect();
            if (scratchNodeRef.current) scratchNodeRef.current.disconnect();
        };
    }, [audioContext, destination, isWorkletReady]);

    const loadTrack = useCallback(async (track: Track) => {
        if (!audioContext || !scratchNodeRef.current) return;
        
        setState(prev => ({ ...prev, isLoading: true }));

        // Stop current playback
        isPlayingRef.current = false;
        scratchNodeRef.current.parameters.get('playbackRate')!.value = 0;

        try {
            // Load and decode audio data
            let arrayBuffer: ArrayBuffer;
            if (track.file) {
                arrayBuffer = await track.file.arrayBuffer();
            } else {
                const response = await fetch(track.url);
                arrayBuffer = await response.arrayBuffer();
            }
            
            const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Send buffer to worklet
            const channelData = [];
            for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                channelData.push(decodedBuffer.getChannelData(i));
            }

            scratchNodeRef.current.port.postMessage({
                type: 'load-buffer',
                buffer: channelData
            });

            // Process BPM
            let bpm = track.bpm || await detectBPM(decodedBuffer);

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
        } catch (error) {
            console.error('[useDeck] Load failed:', error);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [audioContext]);

    const play = useCallback(async () => {
        if (scratchNodeRef.current) {
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            const rate = 1 + (pitchRef.current / 100);
            scratchNodeRef.current.parameters.get('playbackRate')!.setTargetAtTime(rate, audioContext.currentTime, 0.01);
            isPlayingRef.current = true;
            setState(prev => ({ ...prev, isPlaying: true }));
        }
    }, [audioContext]);

    const pause = useCallback(() => {
        if (scratchNodeRef.current) {
            scratchNodeRef.current.parameters.get('playbackRate')!.setTargetAtTime(0, audioContext.currentTime, 0.01);
            isPlayingRef.current = false;
            setState(prev => ({ ...prev, isPlaying: false }));
        }
    }, [audioContext]);

    const seek = useCallback((time: number) => {
        if (scratchNodeRef.current) {
            scratchNodeRef.current.port.postMessage({
                type: 'seek',
                position: time * audioContext.sampleRate
            });
            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, [audioContext]);

    const setPitch = useCallback((update: number | ((prev: number) => number)) => {
        setState(prev => {
            const newPitch = typeof update === 'function' ? update(prev.pitch) : update;
            if (scratchNodeRef.current && isPlayingRef.current && !isScratchingRef.current) {
                const rate = 1 + (newPitch / 100);
                scratchNodeRef.current.parameters.get('playbackRate')!.value = rate;
            }
            return { ...prev, pitch: newPitch };
        });
    }, []);

    const startScratch = useCallback(() => {
        isScratchingRef.current = true;
        if (scratchNodeRef.current) {
            scratchNodeRef.current.parameters.get('isScratching')!.value = 1;
            scratchNodeRef.current.parameters.get('scratchVelocity')!.value = 0;
        }
    }, []);

    const endScratch = useCallback(() => {
        isScratchingRef.current = false;
        if (scratchNodeRef.current) {
            scratchNodeRef.current.parameters.get('isScratching')!.value = 0;
            // Snappy resume logic
            const targetRate = isPlayingRef.current ? (1 + pitchRef.current / 100) : 0;
            scratchNodeRef.current.parameters.get('playbackRate')!.value = targetRate;
        }
    }, []);

    const setScratchRate = useCallback((rate: number) => {
        if (scratchNodeRef.current && isScratchingRef.current) {
            // Realistic mapping of velocity to rate
            // 1.0 = normal speed. Negative = reverse.
            scratchNodeRef.current.parameters.get('scratchVelocity')!.value = rate;
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
                if (scratchNodeRef.current) {
                    scratchNodeRef.current.port.postMessage({
                        type: 'seek',
                        position: newCuePoints[index]! * audioContext.sampleRate
                    });
                }
                return prev;
            } else {
                newCuePoints[index] = prev.currentTime;
                return { ...prev, cuePoints: newCuePoints };
            }
        });
    }, [audioContext]);

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
