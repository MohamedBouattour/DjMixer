import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Track, DeckState } from '../types';
import { AudioEffects } from '../audio/AudioEffects';
import { detectBPM } from '../utils/audioUtils';

interface UseDeckOptions {
    audioContext: AudioContext;
    destination: AudioNode;
    deckId: 'A' | 'B';
}

// Global map to track worklet loading status per AudioContext
// Resolves to true if worklet loaded successfully, false otherwise
const contextWorkletMap = new WeakMap<AudioContext, Promise<boolean>>();

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

    // Fallback mode refs (AudioBufferSourceNode for iOS)
    const useWorkletRef = useRef<boolean>(true); // true = worklet mode, false = fallback
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

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

        // 1. Try to load Worklet - track success/failure
        let workletLoadingPromise = contextWorkletMap.get(audioContext);
        if (!workletLoadingPromise) {
            // Check if AudioWorklet is available at all
            if (typeof audioContext.audioWorklet?.addModule === 'function') {
                workletLoadingPromise = audioContext.audioWorklet.addModule('/worklets/scratch-processor.js')
                    .then(() => {
                        console.log('[Audio] Scratch Processor Loaded (Worklet mode)');
                        return true;
                    })
                    .catch(err => {
                        console.warn('[Audio] Failed to load Scratch Processor, using fallback:', err);
                        return false;
                    });
            } else {
                console.warn('[Audio] AudioWorklet not supported, using fallback mode');
                workletLoadingPromise = Promise.resolve(false);
            }
            contextWorkletMap.set(audioContext, workletLoadingPromise);
        }

        // Determine mode once worklet loading resolves
        workletLoadingPromise.then(workletAvailable => {
            useWorkletRef.current = workletAvailable;
            console.log(`[Audio] Engine mode: ${workletAvailable ? 'AudioWorklet' : 'BufferSource (Fallback)'}`);
        });

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
            if (sourceNodeRef.current) {
                try { sourceNodeRef.current.stop(); } catch (_) { /* ignore */ }
                sourceNodeRef.current.disconnect();
                sourceNodeRef.current = null;
            }
            if (effectsRef.current) effectsRef.current.disconnect();
            if (gainNodeRef.current) gainNodeRef.current.disconnect();
        };
    }, [audioContext, destination]);

    // UI Update Loop (Syncs UI currentTime with Audio Engine)
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

                            if (useWorkletRef.current) {
                                // Worklet mode: send seek message
                                if (workletNodeRef.current && audioBufferRef.current) {
                                    workletNodeRef.current.port.postMessage({
                                        type: 'seek',
                                        position: newTime * audioBufferRef.current.sampleRate
                                    });
                                }
                            } else {
                                // Fallback mode: restart source at loop start
                                restartSourceAtPosition(newTime, rate);
                            }

                            startTimeRef.current = audioContext.currentTime;
                            playOffsetRef.current = newTime;
                        }
                    }

                    // End of track check
                    if (audioBufferRef.current && newTime >= audioBufferRef.current.duration) {
                        if (useWorkletRef.current && workletNodeRef.current) {
                            workletNodeRef.current.parameters.get('playbackRate')?.setValueAtTime(0, audioContext.currentTime);
                            workletNodeRef.current.port.postMessage({
                                type: 'seek',
                                position: 0
                            });
                        } else {
                            stopFallbackSource();
                        }

                        isPlayingRef.current = false;
                        playOffsetRef.current = 0;

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

    // ========== FALLBACK ENGINE HELPERS ==========

    const stopFallbackSource = useCallback(() => {
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.stop(); } catch (_) { /* ignore */ }
            try { sourceNodeRef.current.disconnect(); } catch (_) { /* ignore */ }
            sourceNodeRef.current = null;
        }
    }, []);

    const restartSourceAtPosition = useCallback((position: number, rate: number) => {
        if (!audioBufferRef.current || !audioContext) return;

        // Stop existing source
        stopFallbackSource();

        // Create new source
        const source = audioContext.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.playbackRate.value = rate;

        // Connect through effects chain
        if (effectsRef.current) {
            source.connect(effectsRef.current.input);
        } else if (gainNodeRef.current) {
            source.connect(gainNodeRef.current);
        }

        source.start(0, position);
        sourceNodeRef.current = source;

        // Handle natural end
        source.onended = () => {
            if (sourceNodeRef.current === source && isPlayingRef.current) {
                // Track ended naturally
                isPlayingRef.current = false;
                playOffsetRef.current = 0;
                setState(prev => ({
                    ...prev,
                    currentTime: 0,
                    isPlaying: false
                }));
            }
        };
    }, [audioContext, stopFallbackSource]);

    // ========== TRACK LOADING ==========

    const loadTrack = useCallback(async (track: Track) => {
        // 1. IMMEDIATE RESET (Synchronous)
        isPlayingRef.current = false;
        isScratchingRef.current = false;
        playOffsetRef.current = 0;
        startTimeRef.current = 0;

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
        }

        // Stop worklet audio engine
        if (workletNodeRef.current) {
            try {
                const stopParam = workletNodeRef.current.parameters.get('playbackRate');
                if (stopParam) stopParam.value = 0;
                workletNodeRef.current.disconnect();
            } catch (_) { /* ignore cleanup errors */ }
            workletNodeRef.current = null;
        }

        // Stop fallback audio engine
        stopFallbackSource();

        // 2. Clear UI State immediately to "Loading"
        setState(prev => ({
            ...prev,
            isLoading: true,
            isPlaying: false,
            track: null,
            currentTime: 0,
            activeLoop: null,
            cuePoints: []
        }));

        try {
            // Wait for worklet loading to complete (determines mode)
            const workletPromise = contextWorkletMap.get(audioContext);
            let workletAvailable = false;
            if (workletPromise) {
                workletAvailable = await workletPromise;
            }
            useWorkletRef.current = workletAvailable;

            // Resume AudioContext if suspended (critical for iOS)
            if (audioContext.state === 'suspended') {
                try {
                    await audioContext.resume();
                    console.log('[Audio] AudioContext resumed during track load');
                } catch (e) {
                    console.warn('[Audio] Failed to resume AudioContext:', e);
                }
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

            if (workletAvailable) {
                // ===== WORKLET MODE =====
                try {
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

                            if (isScratchingRef.current) {
                                playOffsetRef.current = time;
                                startTimeRef.current = audioContext.currentTime;
                                setState(prev => ({ ...prev, currentTime: time }));
                            }
                        }
                    };

                    workletNodeRef.current = workletNode;
                    workletNode.parameters.get('playbackRate')?.setValueAtTime(0, audioContext.currentTime);
                    console.log('[Audio] Track loaded in Worklet mode');
                } catch (err) {
                    // Worklet creation failed at runtime, fall back
                    console.warn('[Audio] Worklet node creation failed, switching to fallback:', err);
                    useWorkletRef.current = false;
                    console.log('[Audio] Track loaded in Fallback mode (after worklet failure)');
                }
            } else {
                console.log('[Audio] Track loaded in Fallback mode');
            }

            // Reset State Refs
            isPlayingRef.current = false;
            isScratchingRef.current = false;
            playOffsetRef.current = 0;
            startTimeRef.current = 0;

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
            console.error('[Audio] Failed to load track:', error);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [audioContext, stopFallbackSource]);

    // ========== PLAY ==========

    const play = useCallback(async () => {
        if (!audioBufferRef.current) return;

        // Resume AudioContext if suspended (critical for iOS)
        if (audioContext.state === 'suspended') {
            try {
                await audioContext.resume();
            } catch (e) {
                console.warn('[Audio] Failed to resume AudioContext on play:', e);
            }
        }

        const rate = 1 + (state.pitch / 100);

        if (useWorkletRef.current) {
            // ===== WORKLET MODE =====
            if (!workletNodeRef.current) return;
            const param = workletNodeRef.current.parameters.get('playbackRate');
            if (param) param.setValueAtTime(rate, audioContext.currentTime);
        } else {
            // ===== FALLBACK MODE =====
            restartSourceAtPosition(state.currentTime, rate);
        }

        // Sync state
        startTimeRef.current = audioContext.currentTime;
        playOffsetRef.current = state.currentTime;
        isPlayingRef.current = true;

        setState(prev => ({ ...prev, isPlaying: true }));

        // Start animation loop
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);

    }, [audioContext, state.pitch, state.currentTime, restartSourceAtPosition]);

    // ========== PAUSE ==========

    const pause = useCallback(() => {
        if (useWorkletRef.current) {
            // Worklet mode
            if (workletNodeRef.current) {
                const param = workletNodeRef.current.parameters.get('playbackRate');
                if (param) param.setValueAtTime(0, audioContext.currentTime);
            }
        } else {
            // Fallback mode: stop the source, save position
            const rate = 1 + (state.pitch / 100);
            const elapsed = audioContext.currentTime - startTimeRef.current;
            playOffsetRef.current = playOffsetRef.current + (elapsed * rate);
            stopFallbackSource();
        }

        isPlayingRef.current = false;
        setState(prev => ({ ...prev, isPlaying: false }));

        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }, [audioContext, state.pitch, stopFallbackSource]);

    // ========== SEEK ==========

    const seek = useCallback((time: number) => {
        if (!audioBufferRef.current) return;

        if (useWorkletRef.current) {
            if (workletNodeRef.current && audioBufferRef.current) {
                workletNodeRef.current.port.postMessage({
                    type: 'seek',
                    position: time * audioBufferRef.current.sampleRate
                });
            }
        } else {
            // Fallback mode: if playing, restart at new position
            if (isPlayingRef.current) {
                const rate = 1 + (state.pitch / 100);
                restartSourceAtPosition(time, rate);
            }
        }

        playOffsetRef.current = time;
        startTimeRef.current = audioContext.currentTime;

        setState(prev => ({ ...prev, currentTime: time }));
    }, [audioContext, state.pitch, restartSourceAtPosition]);

    // ========== PITCH ==========

    const setPitch = useCallback((update: number | ((prev: number) => number)) => {
        setState(prev => {
            const newPitch = typeof update === 'function' ? update(prev.pitch) : update;

            if (isPlayingRef.current && !isScratchingRef.current) {
                const rate = 1 + (newPitch / 100);

                if (useWorkletRef.current) {
                    if (workletNodeRef.current) {
                        const param = workletNodeRef.current.parameters.get('playbackRate');
                        if (param) param.linearRampToValueAtTime(rate, audioContext.currentTime + 0.05);
                    }
                } else {
                    // Fallback mode: update playbackRate on existing source
                    if (sourceNodeRef.current) {
                        sourceNodeRef.current.playbackRate.value = rate;
                    }
                    // Also need to update the offset tracking
                    const oldRate = 1 + (prev.pitch / 100);
                    const elapsed = audioContext.currentTime - startTimeRef.current;
                    playOffsetRef.current = playOffsetRef.current + (elapsed * oldRate);
                    startTimeRef.current = audioContext.currentTime;
                }
            }

            return { ...prev, pitch: newPitch };
        });
    }, [audioContext]);

    // ========== SCRATCHING INTERFACE ==========

    const scrub = useCallback((velocity: number) => {
        if (!useWorkletRef.current) {
            // Scratching not supported in fallback mode - just seek
            return;
        }
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
        if (!useWorkletRef.current) return;
        if (!workletNodeRef.current) return;

        const isScratchingParam = workletNodeRef.current.parameters.get('isScratching');

        if (isScratchingParam) {
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
