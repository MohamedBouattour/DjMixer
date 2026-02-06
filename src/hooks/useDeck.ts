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
    const startTimeRef = useRef<number>(0);     // When playback started (context time)
    const playOffsetRef = useRef<number>(0);    // Where in the file we started playing (seconds)
    const isPlayingRef = useRef(false);

    // Scratching / Interaction State
    const isScratchingRef = useRef(false);

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
    const updateCurrentTime = useCallback(() => {
        // We need to query the Worklet or estimate time
        // Since play/pause is handled by parameters, getting exact time specific sample is tricky without message back
        // But we can estimate or implement a message port query.

        // For now, simpler estimation if playing:
        if (isPlayingRef.current && !isScratchingRef.current) {
            setState(prev => {
                // Determine playback speed
                const rate = 1 + (prev.pitch / 100);
                const elapsed = audioContext.currentTime - startTimeRef.current;

                let newTime = playOffsetRef.current + (elapsed * rate);

                // Loop Logic (Simple UI side check, ideal is Worklet side)
                if (state.activeLoop && state.activeLoop.active) {
                    if (newTime >= state.activeLoop.end) {
                        // This loop logic is purely visual/state if not synced with worklet
                        // TODO: Push loop points to worklet
                        // For visual consistency:
                        const loopDuration = state.activeLoop.end - state.activeLoop.start;
                        const loopOffset = newTime - state.activeLoop.end;
                        newTime = state.activeLoop.start + (loopOffset % loopDuration);

                        // We should re-sync the engine ideally, but let's assume engine loops? 
                        // No, our engine doesn't loop yet.
                        // Let's force seek for now.
                        if (workletNodeRef.current) {
                            // This is hacky for tight loops but "ok" for now
                            // Ideally pass loop start/end to Worklet params
                            workletNodeRef.current.port.postMessage({
                                type: 'seek',
                                position: newTime * audioBufferRef.current!.sampleRate
                            });
                            // Reset time base
                            startTimeRef.current = audioContext.currentTime;
                            playOffsetRef.current = newTime;
                        }
                    }
                }

                // End of track check
                if (audioBufferRef.current && newTime >= audioBufferRef.current.duration) {
                    newTime = audioBufferRef.current.duration;
                    // Stop?
                }

                return { ...prev, currentTime: newTime };
            });

            animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
        }
    }, [audioContext, state.activeLoop]);

    const loadTrack = useCallback(async (track: Track) => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            // Wait for worklet module
            if (workletLoadingPromise) await workletLoadingPromise;

            // Stop existing
            if (workletNodeRef.current) {
                const stopParam = workletNodeRef.current.parameters.get('playbackRate');
                if (stopParam) stopParam.value = 0; // stop
                workletNodeRef.current.disconnect();
                workletNodeRef.current = null;
            }

            // 1. Fetch & Decode Audio
            let arrayBuffer: ArrayBuffer;
            if (track.file) {
                arrayBuffer = await track.file.arrayBuffer();
            } else {
                const response = await fetch(track.url);
                arrayBuffer = await response.arrayBuffer();
            }
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioBufferRef.current = audioBuffer;

            // 2. Detect BPM if missing
            let bpm = track.bpm;
            if (!bpm) {
                bpm = await detectBPM(audioBuffer);
            }

            // 3. Create Worklet Node
            const workletNode = new AudioWorkletNode(audioContext, 'scratch-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2], // Stereo
                processorOptions: {}
            });

            // 4. Send Buffer to Worklet
            // We need to split channels for transfer
            const channels = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                channels.push(audioBuffer.getChannelData(i));
            }
            workletNode.port.postMessage({
                type: 'load-buffer',
                buffer: channels
            });

            // 5. Connect
            if (effectsRef.current) {
                workletNode.connect(effectsRef.current.input);
            } else if (gainNodeRef.current) {
                workletNode.connect(gainNodeRef.current);
            }
            workletNodeRef.current = workletNode;

            // 6. Reset State
            isPlayingRef.current = false;
            if (workletNode.parameters.get('playbackRate')) {
                workletNode.parameters.get('playbackRate')!.setValueAtTime(0, audioContext.currentTime);
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

        const currentPitch = state.pitch;
        const rate = 1 + (currentPitch / 100);

        // Set parameter
        const param = workletNodeRef.current.parameters.get('playbackRate');
        if (param) param.setValueAtTime(rate, audioContext.currentTime);

        // Sync state
        startTimeRef.current = audioContext.currentTime;
        playOffsetRef.current = state.currentTime;
        isPlayingRef.current = true;

        setState(prev => ({ ...prev, isPlaying: true }));

        // Start Loop
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(updateCurrentTime);

    }, [audioContext, state.pitch, state.currentTime, updateCurrentTime]);

    const pause = useCallback(() => {
        if (workletNodeRef.current) {
            const param = workletNodeRef.current.parameters.get('playbackRate');
            if (param) param.setValueAtTime(0, audioContext.currentTime);

            isPlayingRef.current = false;

            // Capture accurate time?
            // Since we drifted in UI loop, simpler to keep UI time as Reference for now.
            // Ideally we query Worklet.

            setState(prev => ({ ...prev, isPlaying: false }));

            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
    }, [audioContext]);

    const seek = useCallback((time: number) => {
        if (workletNodeRef.current && audioBufferRef.current) {
            // Update audio engine
            workletNodeRef.current.port.postMessage({
                type: 'seek',
                position: time * audioBufferRef.current.sampleRate
            });

            // Update generic state
            playOffsetRef.current = time;
            startTimeRef.current = audioContext.currentTime;

            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, [audioContext]);

    const setPitch = useCallback((update: number | ((prev: number) => number)) => {
        setState(prev => {
            const newPitch = typeof update === 'function' ? update(prev.pitch) : update;

            if (workletNodeRef.current && isPlayingRef.current) {
                const rate = 1 + (newPitch / 100);
                const param = workletNodeRef.current.parameters.get('playbackRate');
                // Smooth transition
                if (param) param.linearRampToValueAtTime(rate, audioContext.currentTime + 0.1);
            }

            return { ...prev, pitch: newPitch };
        });
    }, [audioContext]);

    // Scratching Interface
    const scrub = useCallback((velocity: number) => {
        // This is called when dragging the vinyl
        if (workletNodeRef.current) {
            const isScratchingParam = workletNodeRef.current.parameters.get('isScratching');
            const velocityParam = workletNodeRef.current.parameters.get('scratchVelocity');

            if (isScratchingParam && velocityParam) {
                // Use setTargetAtTime or setValueAtTime
                // Instant change
                isScratchingParam.setValueAtTime(1, audioContext.currentTime);
                velocityParam.setValueAtTime(velocity, audioContext.currentTime);
            }

            isScratchingRef.current = true;
        }
    }, [audioContext]);

    const releaseScratch = useCallback(() => {
        if (workletNodeRef.current) {
            const isScratchingParam = workletNodeRef.current.parameters.get('isScratching');

            if (isScratchingParam) {
                // Return to normal
                isScratchingParam.setValueAtTime(0, audioContext.currentTime);
            }

            isScratchingRef.current = false;

            // If we were supposed to be playing?
            // We need to restore 'playbackRate' param if it was messed up?
            // Actually params are independent.
            // If 'playbackRate' was 1.0, it will resume at 1.0

            // But we need to sync our UI playhead
            // We don't know where the scratch ended up unless we track it or ask worklet.
            // Worklet kept 'position' updated.

            // HACK: For now, we don't know the exact new time in UI.
            // We might see a jump when we start playing again.
            // But continuous scratch should be ok.
        }
    }, [audioContext]);

    // Standard Controls
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
                // Jump to CUE
                seek(newCuePoints[index]!);
                return prev;
            } else {
                // Set CUE
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
        // Ensure loop is sent to worklet if needed, or handled in update loop
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
