import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Track, DeckState } from '../types';
import { AudioEffects } from '../audio/AudioEffects';
import { detectBPM } from '../utils/audioUtils';

interface UseDeckOptions {
    audioContext: AudioContext;
    destination: AudioNode;
    deckId: 'A' | 'B';
}

// Global promise to track worklet loading status to avoid double-loading
let workletLoadingPromise: Promise<void> | null = null;

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

    // Refs for Audio Subsystem
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const effectsRef = useRef<AudioEffects | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);

    // Animation & Logic Refs
    const animationFrameRef = useRef<number | undefined>(undefined);
    const startTimeRef = useRef<number>(0);
    const playOffsetRef = useRef<number>(0);
    const isPlayingRef = useRef(false);
    const activeLoopRef = useRef<DeckState['activeLoop']>(null);

    // Store the update function in a ref so it can reference itself
    const updateCurrentTimeRef = useRef<() => void>(() => { });

    // Scratching State
    const isScratchingRef = useRef(false);
    const wasPlayingBeforeScratchRef = useRef(false);

    // Update ref when state changes
    useEffect(() => {
        activeLoopRef.current = state.activeLoop;
    }, [state.activeLoop]);

    // Initialize Audio Graph
    useEffect(() => {
        if (!audioContext || !destination) return;

        // 1. Ensure Worklet is Loaded
        if (!workletLoadingPromise) {
            workletLoadingPromise = audioContext.audioWorklet.addModule('/worklets/scratch-processor.js')
                .then(() => console.log('Scratch Processor Loaded'))
                .catch(err => console.error('Failed to load Scratch Processor:', err));
        }

        // 2. Create Gain Node (Volume)
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.gain.value = state.volume / 100;

        // 3. Create Effects Chain
        effectsRef.current = new AudioEffects(audioContext);
        effectsRef.current.connectToDestination(gainNodeRef.current);
        gainNodeRef.current.connect(destination);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (workletNodeRef.current) {
                workletNodeRef.current.disconnect();
                workletNodeRef.current = null;
            }
            if (effectsRef.current) effectsRef.current.disconnect();
            if (gainNodeRef.current) gainNodeRef.current.disconnect();
        };
    }, [audioContext, destination]);

    // UI Update Loop (Syncs UI currentTime with Audio Engine)
    // We use a ref to store the function so it can reference itself without lint issues
    useEffect(() => {
        updateCurrentTimeRef.current = () => {
            if (isPlayingRef.current && !isScratchingRef.current) {
                setState(prev => {
                    const rate = 1 + (prev.pitch / 100);
                    const elapsed = audioContext.currentTime - startTimeRef.current;
                    let newTime = playOffsetRef.current + (elapsed * rate);

                    // Loop Logic
                    const activeLoop = activeLoopRef.current;
                    if (activeLoop && activeLoop.active) {
                        if (newTime >= activeLoop.end) {
                            const loopDuration = activeLoop.end - activeLoop.start;
                            const loopOffset = newTime - activeLoop.end;
                            newTime = activeLoop.start + (loopOffset % loopDuration);

                            if (workletNodeRef.current && audioBufferRef.current) {
                                workletNodeRef.current.port.postMessage({
                                    type: 'seek',
                                    position: newTime * audioBufferRef.current.sampleRate
                                });
                                startTimeRef.current = audioContext.currentTime;
                                playOffsetRef.current = newTime;
                            }
                        }
                    }

                    // End of track check
                    if (audioBufferRef.current && newTime >= audioBufferRef.current.duration) {
                        // Reset to start (0)

                        // Stop Audio Engine & Seek to 0
                        if (workletNodeRef.current) {
                            workletNodeRef.current.parameters.get('playbackRate')?.setValueAtTime(0, audioContext.currentTime);
                            workletNodeRef.current.port.postMessage({
                                type: 'seek',
                                position: 0
                            });
                        }

                        isPlayingRef.current = false;
                        playOffsetRef.current = 0;

                        // Return final stopped state at time 0
                        return {
                            ...prev,
                            currentTime: 0,
                            isPlaying: false
                        };
                    }

                    return { ...prev, currentTime: newTime };
                });

                animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);
            }
        };
    }, [audioContext]);

    const loadTrack = useCallback(async (track: Track) => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            if (workletLoadingPromise) await workletLoadingPromise;

            // Stop existing
            if (workletNodeRef.current) {
                const stopParam = workletNodeRef.current.parameters.get('playbackRate');
                if (stopParam) stopParam.value = 0;
                workletNodeRef.current.disconnect();
                workletNodeRef.current = null;
            }

            // Fetch & Decode Audio
            let arrayBuffer: ArrayBuffer;
            if (track.file) {
                arrayBuffer = await track.file.arrayBuffer();
            } else {
                const response = await fetch(track.url);
                arrayBuffer = await response.arrayBuffer();
            }
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioBufferRef.current = audioBuffer;

            // Detect BPM if missing
            let bpm = track.bpm;
            if (!bpm) {
                bpm = await detectBPM(audioBuffer);
            }

            // Create Worklet Node
            const workletNode = new AudioWorkletNode(audioContext, 'scratch-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                processorOptions: {}
            });

            // Send Buffer to Worklet
            const channels: Float32Array[] = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                channels.push(audioBuffer.getChannelData(i));
            }
            workletNode.port.postMessage({
                type: 'load-buffer',
                buffer: channels
            });

            // Connect to effects chain
            if (effectsRef.current) {
                workletNode.connect(effectsRef.current.input);
            } else if (gainNodeRef.current) {
                workletNode.connect(gainNodeRef.current);
            }

            // Handle messages FROM worklet (position sync)
            workletNode.port.onmessage = (event) => {
                if (event.data.type === 'position') {
                    const { position } = event.data;
                    const time = position / audioBuffer.sampleRate;

                    // Update our tracking refs
                    playOffsetRef.current = time;
                    startTimeRef.current = audioContext.currentTime;

                    // Also update state currentTime during scratching for visual feedback
                    if (isScratchingRef.current) {
                        setState(prev => ({ ...prev, currentTime: time }));
                    }
                }
            };

            workletNodeRef.current = workletNode;

            // Reset State
            isPlayingRef.current = false;
            isScratchingRef.current = false;
            workletNode.parameters.get('playbackRate')?.setValueAtTime(0, audioContext.currentTime);

            setState(prev => ({
                ...prev,
                track: { ...track, bpm },
                currentTime: 0,
                isPlaying: false,
                isLoading: false,
                activeLoop: null,
                cuePoints: []
            }));

        } catch (error) {
            console.error('Failed to load track:', error);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [audioContext]);

    const play = useCallback(async () => {
        if (!workletNodeRef.current) return;

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const rate = 1 + (state.pitch / 100);

        // Set playback rate
        const param = workletNodeRef.current.parameters.get('playbackRate');
        if (param) param.setValueAtTime(rate, audioContext.currentTime);

        // Sync state
        startTimeRef.current = audioContext.currentTime;
        playOffsetRef.current = state.currentTime;
        isPlayingRef.current = true;

        setState(prev => ({ ...prev, isPlaying: true }));

        // Start animation loop
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);

    }, [audioContext, state.pitch, state.currentTime]);

    const pause = useCallback(() => {
        if (workletNodeRef.current) {
            const param = workletNodeRef.current.parameters.get('playbackRate');
            if (param) param.setValueAtTime(0, audioContext.currentTime);

            isPlayingRef.current = false;
            setState(prev => ({ ...prev, isPlaying: false }));

            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
    }, [audioContext]);

    const seek = useCallback((time: number) => {
        if (workletNodeRef.current && audioBufferRef.current) {
            workletNodeRef.current.port.postMessage({
                type: 'seek',
                position: time * audioBufferRef.current.sampleRate
            });

            playOffsetRef.current = time;
            startTimeRef.current = audioContext.currentTime;

            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, [audioContext]);

    const setPitch = useCallback((update: number | ((prev: number) => number)) => {
        setState(prev => {
            const newPitch = typeof update === 'function' ? update(prev.pitch) : update;

            // Only update worklet if playing (not scratching)
            if (workletNodeRef.current && isPlayingRef.current && !isScratchingRef.current) {
                const rate = 1 + (newPitch / 100);
                const param = workletNodeRef.current.parameters.get('playbackRate');
                if (param) param.linearRampToValueAtTime(rate, audioContext.currentTime + 0.05);
            }

            return { ...prev, pitch: newPitch };
        });
    }, [audioContext]);

    // ========== SCRATCHING INTERFACE ==========

    const scrub = useCallback((velocity: number) => {
        if (!workletNodeRef.current) return;

        const isScratchingParam = workletNodeRef.current.parameters.get('isScratching');
        const velocityParam = workletNodeRef.current.parameters.get('scratchVelocity');

        // Remember if we were playing before scratching started
        if (!isScratchingRef.current) {
            wasPlayingBeforeScratchRef.current = isPlayingRef.current;

            // Stop the UI animation loop during scratching
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
        }

        if (isScratchingParam && velocityParam) {
            isScratchingParam.setValueAtTime(1, audioContext.currentTime);
            velocityParam.setValueAtTime(velocity, audioContext.currentTime);
        }

        isScratchingRef.current = true;
    }, [audioContext]);

    const releaseScratch = useCallback(() => {
        if (!workletNodeRef.current) return;

        const isScratchingParam = workletNodeRef.current.parameters.get('isScratching');

        if (isScratchingParam) {
            // Set isScratching to 0 - the worklet's motor simulation will take over
            isScratchingParam.setValueAtTime(0, audioContext.currentTime);
        }

        isScratchingRef.current = false;

        // If we were playing before the scratch, make sure playbackRate is set correctly
        if (wasPlayingBeforeScratchRef.current) {
            setState(prev => {
                const rate = 1 + (prev.pitch / 100);
                const param = workletNodeRef.current?.parameters.get('playbackRate');
                if (param) param.setValueAtTime(rate, audioContext.currentTime);
                return prev;
            });

            // Restart the UI animation loop
            if (!animationFrameRef.current) {
                animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);
            }
        } else {
            // Track was paused - ensure playbackRate is 0
            const param = workletNodeRef.current.parameters.get('playbackRate');
            if (param) param.setValueAtTime(0, audioContext.currentTime);
        }

    }, [audioContext]);

    // ========== STANDARD CONTROLS ==========

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
            setState(prev => ({ ...prev, eq: { ...prev.eq, [band]: value } }));
        }
    }, []);

    const setEffect = useCallback((effect: keyof DeckState['activeEffects'], value: number) => {
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

    const toggleEffect = useCallback((effect: keyof DeckState['activeEffects']) => {
        setState(prev => {
            const isActive = prev.activeEffects[effect];
            const newValue = !isActive;

            if (effectsRef.current) {
                const value = newValue ? (['distortion', 'bitcrusher'].includes(effect) ? 20 : 50) : 0;
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

            return { ...prev, activeEffects: { ...prev.activeEffects, [effect]: newValue } };
        });
    }, []);

    const handleCue = useCallback((index: number) => {
        setState(prev => {
            const newCuePoints = [...prev.cuePoints];
            if (newCuePoints[index] !== undefined && newCuePoints[index] !== null) {
                seek(newCuePoints[index]!);
                return prev;
            } else {
                newCuePoints[index] = prev.currentTime;
                return { ...prev, cuePoints: newCuePoints };
            }
        });
    }, [seek]);

    const deleteCue = useCallback((index: number) => {
        setState(prev => {
            const newCues = [...prev.cuePoints];
            newCues[index] = undefined;
            return { ...prev, cuePoints: newCues };
        });
    }, []);

    const setLoop = useCallback((start: number, end: number) => {
        const loop = { start, end, active: true };
        setState(prev => ({ ...prev, activeLoop: loop }));
    }, []);

    const clearLoop = useCallback(() => {
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
        setVolume,
        setEQ,
        setEffect,
        toggleEffect,
        handleCue,
        deleteCue,
        setLoop,
        clearLoop,
        setIsLoading,
        scrub,
        releaseScratch
    }), [loadTrack, play, pause, seek, setPitch, setVolume, setEQ, setEffect, toggleEffect, handleCue, deleteCue, setLoop, clearLoop, setIsLoading, scrub, releaseScratch]);

    return { state, controls };
};
