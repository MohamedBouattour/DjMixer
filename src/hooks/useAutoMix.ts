import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track, DeckState } from '../types';
import { API_ENDPOINTS } from '../config';

export type AutoMixPhase =
    | 'IDLE'
    | 'FINDING'
    | 'LOADING'
    | 'READY'
    | 'LOOPING'
    | 'TRANSITIONING'
    | 'COOLDOWN';

interface DeckControls {
    loadTrack: (track: Track) => Promise<void>;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setVolume: (update: number | ((prev: number) => number)) => void;
    setLoop: (start: number, end: number) => void;
    clearLoop: () => void;
    setIsLoading: (isLoading: boolean) => void;
}

interface UseAutoMixOptions {
    deckAState: DeckState;
    deckBState: DeckState;
    deckAControls: DeckControls;
    deckBControls: DeckControls;
    tracks: Track[];
    onImportTrack: (track: Track, deckId: 'A' | 'B', silent?: boolean) => Promise<void>;
}

// How many seconds before end of current track to start transition
const TRANSITION_TRIGGER_SECONDS = 30;
// Duration of volume fade in seconds
const FADE_DURATION_MS = 8000;
// Volume for the looped next track (0-150 scale, 40% of max)
const LOOP_VOLUME = 60; // 40% of 150
// Cooldown after transition before finding next
const COOLDOWN_MS = 3000;

export const useAutoMix = ({
    deckAState,
    deckBState,
    deckAControls,
    deckBControls,
    tracks,
    onImportTrack,
}: UseAutoMixOptions) => {
    const [isActive, setIsActive] = useState(false);
    const [phase, setPhase] = useState<AutoMixPhase>('IDLE');
    const [activeDeck, setActiveDeck] = useState<'A' | 'B' | null>(null);
    const [statusText, setStatusText] = useState('');

    // Refs for stable access in callbacks/intervals
    const isActiveRef = useRef(false);
    const phaseRef = useRef<AutoMixPhase>('IDLE');
    const activeDeckRef = useRef<'A' | 'B' | null>(null);
    const playedSetRef = useRef<Set<string>>(new Set());
    const fadeAnimRef = useRef<number | null>(null);
    const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionStartedRef = useRef(false);
    
    // Asynchronous request cancellation token
    const currentSearchIdRef = useRef<number>(0);

    // Keep refs in sync
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { activeDeckRef.current = activeDeck; }, [activeDeck]);

    const getIdleDeckId = useCallback((): 'A' | 'B' => {
        return activeDeckRef.current === 'A' ? 'B' : 'A';
    }, []);

    const getIdleControls = useCallback((): DeckControls => {
        return activeDeckRef.current === 'A' ? deckBControls : deckAControls;
    }, [deckAControls, deckBControls]);

    const getActiveControls = useCallback((): DeckControls => {
        return activeDeckRef.current === 'A' ? deckAControls : deckBControls;
    }, [deckAControls, deckBControls]);

    // Keep activeIsPlayingRef updated
    const activeIsPlayingRef = useRef(false);
    useEffect(() => {
        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        activeIsPlayingRef.current = activeState.isPlaying;
    }, [activeDeck, deckAState.isPlaying, deckBState.isPlaying]);

    // Find a similar track by BPM — local library first, then API
    const findSimilarTrack = useCallback(async (currentBpm: number): Promise<Track | null> => {
        const tolerance = 0.15; // ±15%
        const minBpm = currentBpm * (1 - tolerance);
        const maxBpm = currentBpm * (1 + tolerance);

        // 1. Search local library
        const localMatches = tracks.filter(t =>
            t.bpm &&
            t.bpm >= minBpm &&
            t.bpm <= maxBpm &&
            !playedSetRef.current.has(t.id)
        );

        if (localMatches.length > 0) {
            const randomIndex = Math.floor(Math.random() * localMatches.length);
            console.log(`[AutoMix] Found local match: ${localMatches[randomIndex].name} (${localMatches[randomIndex].bpm} BPM)`);
            return localMatches[randomIndex];
        }

        // 2. Fallback to API
        try {
            let excludeIds = Array.from(playedSetRef.current).join(',');
            let response = await fetch(
                `${API_ENDPOINTS.SUGGEST}?bpm=${Math.round(currentBpm)}&exclude=${encodeURIComponent(excludeIds)}`
            );
            if (!response.ok) throw new Error('Suggest API failed');
            let suggestions = await response.json();

            // If suggestions are empty, prune playedSetRef and try again
            if (suggestions.length === 0 && playedSetRef.current.size > 2) {
                console.log('[AutoMix] Suggestion pool exhausted, pruning history exclusions...');
                const activeId = activeDeckRef.current === 'A' ? deckAState.track?.id : deckBState.track?.id;
                const idleId = activeDeckRef.current === 'A' ? deckBState.track?.id : deckAState.track?.id;
                playedSetRef.current.clear();
                if (activeId) playedSetRef.current.add(activeId);
                if (idleId) playedSetRef.current.add(idleId);

                excludeIds = Array.from(playedSetRef.current).join(',');
                response = await fetch(
                    `${API_ENDPOINTS.SUGGEST}?bpm=${Math.round(currentBpm)}&exclude=${encodeURIComponent(excludeIds)}`
                );
                if (response.ok) {
                    suggestions = await response.json();
                }
            }

            if (suggestions && suggestions.length > 0) {
                const pick = suggestions[0];
                const track: Track = {
                    id: pick.id,
                    name: pick.name || pick.title,
                    duration: pick.duration,
                    url: `${API_ENDPOINTS.STREAM}?videoId=${pick.id}`,
                    bpm: currentBpm, // Assume similar BPM since we searched for it
                };
                console.log(`[AutoMix] API suggestion: ${track.name}`);
                return track;
            }
        } catch (e) {
            console.warn('[AutoMix] API suggestion failed:', e);
        }

        return null;
    }, [tracks, deckAState.track?.id, deckBState.track?.id]);

    // Calculate loop bounds: first 8 beats from start
    const getLoopBounds = useCallback((bpm: number): { start: number; end: number } => {
        const beatsPerSecond = bpm / 60;
        const loopDuration = 8 / beatsPerSecond; // 8 beats
        return { start: 0, end: Math.max(loopDuration, 2) }; // minimum 2 seconds
    }, []);

    // Smooth volume fade using requestAnimationFrame (pauses when music is paused)
    const fadeVolume = useCallback((
        controls: DeckControls,
        fromVol: number,
        toVol: number,
        durationMs: number,
        onComplete?: () => void
    ) => {
        if (fadeAnimRef.current) cancelAnimationFrame(fadeAnimRef.current);

        let elapsedMs = 0;
        let lastTime = performance.now();

        const animate = (now: number) => {
            const delta = now - lastTime;
            lastTime = now;

            // Only advance fade progress if the active track is playing
            if (activeIsPlayingRef.current) {
                elapsedMs += delta;
            }

            const progress = Math.min(elapsedMs / durationMs, 1);
            // Ease in-out
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            const currentVol = fromVol + (toVol - fromVol) * eased;

            controls.setVolume(Math.round(currentVol));

            if (progress < 1) {
                fadeAnimRef.current = requestAnimationFrame(animate);
            } else {
                fadeAnimRef.current = null;
                onComplete?.();
            }
        };
        fadeAnimRef.current = requestAnimationFrame(animate);
    }, []);

    // === Main cycle: FINDING phase ===
    const startFinding = useCallback(async () => {
        if (!isActiveRef.current) return;

        const searchId = ++currentSearchIdRef.current;

        setPhase('FINDING');
        setStatusText('Finding next track...');

        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;
        const currentBpm = activeState.track?.bpm || 120;

        const nextTrack = await findSimilarTrack(currentBpm);
        
        // Guard against cancellation / new search triggered
        if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;

        if (!nextTrack) {
            setStatusText('No matches found');
            // Retry after a delay
            setTimeout(() => {
                if (isActiveRef.current && searchId === currentSearchIdRef.current) {
                    startFinding();
                }
            }, 5000);
            return;
        }

        // === LOADING phase ===
        setPhase('LOADING');
        setStatusText(`Loading: ${nextTrack.name.substring(0, 30)}...`);

        const idleDeckId = getIdleDeckId();
        playedSetRef.current.add(nextTrack.id);

        try {
            await onImportTrack(nextTrack, idleDeckId, true);
        } catch (e) {
            console.error('[AutoMix] Load failed:', e);
            if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;
            setStatusText('Load failed, retrying...');
            setTimeout(() => {
                if (isActiveRef.current && searchId === currentSearchIdRef.current) {
                    startFinding();
                }
            }, 3000);
            return;
        }

        if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;

        // === LOOPING phase ===
        // Wait a moment for the track to fully load into the deck
        setTimeout(() => {
            if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;

            setPhase('LOOPING');
            setStatusText('Next track ready — looping...');
            transitionStartedRef.current = false;

            const idleControls = getIdleControls();
            const bpm = nextTrack.bpm || currentBpm;
            const { start, end } = getLoopBounds(bpm);

            // Set loop, volume to 40%, and start playing immediately
            idleControls.setVolume(LOOP_VOLUME);
            idleControls.seek(start);
            idleControls.setLoop(start, end);
            
            // Sync play state with active deck
            const activeState2 = activeDeckRef.current === 'A' ? deckAState : deckBState;
            if (activeState2.isPlaying) {
                idleControls.play();
            } else {
                idleControls.pause();
            }
        }, 1000);
    }, [deckAState, deckBState, findSimilarTrack, getIdleDeckId, getIdleControls, getLoopBounds, onImportTrack]);

    // === Trigger Transition manually / force mix ===
    const triggerTransition = useCallback(() => {
        if (!isActiveRef.current || phaseRef.current !== 'LOOPING' || transitionStartedRef.current) {
            console.warn('[AutoMix] Cannot trigger transition: phase is not LOOPING or already transitioning');
            return;
        }

        console.log('[AutoMix] Manually triggering transition...');
        transitionStartedRef.current = true;
        setPhase('TRANSITIONING');
        setStatusText('Transitioning...');

        const idleControls = getIdleControls();
        const activeControls = getActiveControls();
        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;

        // Exit the loop on the next track
        idleControls.clearLoop();

        // Fade new track from LOOP_VOLUME → 100
        fadeVolume(idleControls, LOOP_VOLUME, 100, FADE_DURATION_MS);

        // Fade old track from current volume → 0
        fadeVolume(activeControls, activeState.volume, 0, FADE_DURATION_MS, () => {
            if (!isActiveRef.current) return;

            // Old track done — pause it
            activeControls.pause();
            activeControls.setVolume(100); // Reset for later use

            // Swap active deck
            const newActiveDeck = getIdleDeckId();
            setActiveDeck(newActiveDeck);

            // === COOLDOWN phase ===
            setPhase('COOLDOWN');
            setStatusText('Preparing next...');

            cooldownTimerRef.current = setTimeout(() => {
                if (isActiveRef.current) {
                    startFinding();
                }
            }, COOLDOWN_MS);
        });
    }, [getIdleControls, getActiveControls, getIdleDeckId, fadeVolume, startFinding, deckAState, deckBState]);

    // === Monitor active deck for transition trigger ===
    useEffect(() => {
        if (!isActive) return;

        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        if (!activeState.track || !activeState.isPlaying) return;

        const timeRemaining = activeState.track.duration - activeState.currentTime;

        // Enter TRANSITIONING phase (exit loop, fade in next track, fade out current track 30s before end / rhythm down)
        if (phase === 'LOOPING' && timeRemaining <= TRANSITION_TRIGGER_SECONDS && !transitionStartedRef.current) {
            triggerTransition();
        }
    }, [isActive, phase, activeDeck, deckAState.currentTime, deckAState.track?.duration, deckAState.isPlaying, deckBState.currentTime, deckBState.track?.duration, deckBState.isPlaying, triggerTransition]);

    // === Sync idle deck playing state with active deck playing state ===
    useEffect(() => {
        if (!isActive || (phase !== 'LOOPING' && phase !== 'TRANSITIONING')) return;

        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        const idleControls = activeDeck === 'A' ? deckBControls : deckAControls;

        if (activeState.isPlaying) {
            idleControls.play();
        } else {
            idleControls.pause();
        }
    }, [isActive, phase, activeDeck, deckAState.isPlaying, deckBState.isPlaying, deckAControls, deckBControls]);

    // === Track if the active track changed to trigger refetch ===
    const lastActiveTrackIdRef = useRef<string | null>(null);
    const lastActiveDeckRef = useRef<'A' | 'B' | null>(null);
    useEffect(() => {
        if (!isActive || phase === 'IDLE') return;

        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        if (!activeState.track) return;

        const currentTrackId = activeState.track.id;
        
        // Manual song change check: same deck, different track ID
        const deckHasChanged = lastActiveDeckRef.current !== activeDeck;
        const trackHasChanged = lastActiveTrackIdRef.current && lastActiveTrackIdRef.current !== currentTrackId;

        if (!deckHasChanged && trackHasChanged) {
            console.log(`[AutoMix] Active track manually changed on deck ${activeDeck} from ${lastActiveTrackIdRef.current} to ${currentTrackId}. Adapting and refetching...`);
            
            // Cancel pending transitions & timers
            currentSearchIdRef.current++;
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
            if (fadeAnimRef.current) {
                cancelAnimationFrame(fadeAnimRef.current);
                fadeAnimRef.current = null;
            }
            transitionStartedRef.current = false;
            
            startFinding();
        }

        lastActiveTrackIdRef.current = currentTrackId;
        lastActiveDeckRef.current = activeDeck;
    }, [isActive, phase, activeDeck, deckAState.track?.id, deckBState.track?.id, startFinding]);

    // === Track if the idle track was changed manually ===
    const lastIdleTrackIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isActive) return;

        const idleDeckId = activeDeck === 'A' ? 'B' : 'A';
        const idleState = idleDeckId === 'A' ? deckAState : deckBState;
        const idleControls = idleDeckId === 'A' ? deckAControls : deckBControls;

        if (!idleState.track) {
            lastIdleTrackIdRef.current = null;
            return;
        }

        const currentIdleTrackId = idleState.track.id;

        if (lastIdleTrackIdRef.current && lastIdleTrackIdRef.current !== currentIdleTrackId) {
            if (phase !== 'TRANSITIONING' && phase !== 'COOLDOWN') {
                console.log(`[AutoMix] Idle track manually changed on deck ${idleDeckId} to ${idleState.track.name}. Adapting...`);
                
                // Cancel pending search
                currentSearchIdRef.current++;
                if (cooldownTimerRef.current) {
                    clearTimeout(cooldownTimerRef.current);
                    cooldownTimerRef.current = null;
                }
                
                // Set phase to LOOPING since track is loaded
                setPhase('LOOPING');
                setStatusText(`Manual track ready: ${idleState.track.name.substring(0, 20)}`);
                transitionStartedRef.current = false;

                const bpm = idleState.track.bpm || 120;
                const { start, end } = getLoopBounds(bpm);

                // Setup loop and volume and play state
                idleControls.setVolume(LOOP_VOLUME);
                idleControls.seek(start);
                idleControls.setLoop(start, end);
                
                const activeState = activeDeck === 'A' ? deckAState : deckBState;
                if (activeState.isPlaying) {
                    idleControls.play();
                } else {
                    idleControls.pause();
                }
            }
        }

        lastIdleTrackIdRef.current = currentIdleTrackId;
    }, [isActive, phase, activeDeck, deckAState.track?.id, deckBState.track?.id, deckAState.isPlaying, deckBState.isPlaying, getLoopBounds, deckAControls, deckBControls]);

    // === Toggle Auto Mix ===
    const toggle = useCallback(() => {
        if (isActive) {
            // Turn OFF
            setIsActive(false);
            setPhase('IDLE');
            setActiveDeck(null);
            setStatusText('');
            transitionStartedRef.current = false;
            currentSearchIdRef.current++; // cancel pending searches

            if (fadeAnimRef.current) {
                cancelAnimationFrame(fadeAnimRef.current);
                fadeAnimRef.current = null;
            }
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
        } else {
            // Turn ON — determine which deck is currently active
            let startDeck: 'A' | 'B' = 'A';
            if (deckBState.isPlaying && !deckAState.isPlaying) {
                startDeck = 'B';
            } else if (deckAState.isPlaying && !deckBState.isPlaying) {
                startDeck = 'A';
            } else if (deckAState.isPlaying && deckBState.isPlaying) {
                // Both playing — pick the one with more time remaining
                const aRemaining = (deckAState.track?.duration || 0) - deckAState.currentTime;
                const bRemaining = (deckBState.track?.duration || 0) - deckBState.currentTime;
                startDeck = aRemaining >= bRemaining ? 'A' : 'B';
            } else {
                // Neither playing — check which has a track loaded
                if (deckAState.track) startDeck = 'A';
                else if (deckBState.track) startDeck = 'B';
                else {
                    setStatusText('Load a track first!');
                    setTimeout(() => setStatusText(''), 2000);
                    return;
                }
            }

            // Add current tracks to played set
            if (deckAState.track) playedSetRef.current.add(deckAState.track.id);
            if (deckBState.track) playedSetRef.current.add(deckBState.track.id);

            setIsActive(true);
            setActiveDeck(startDeck);
            setStatusText('Auto Mix ON');
            setPhase('FINDING');

            // Set refs immediately
            isActiveRef.current = true;
            activeDeckRef.current = startDeck;
            phaseRef.current = 'FINDING';

            // If the active deck isn't playing, start it
            const controls = startDeck === 'A' ? deckAControls : deckBControls;
            const state = startDeck === 'A' ? deckAState : deckBState;
            if (!state.isPlaying && state.track) {
                controls.play();
            }

            // Start finding immediately
            startFinding();
        }
    }, [isActive, deckAState, deckBState, deckAControls, deckBControls, startFinding]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            currentSearchIdRef.current++;
            if (fadeAnimRef.current) cancelAnimationFrame(fadeAnimRef.current);
            if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        };
    }, []);

    return {
        isActive,
        phase,
        activeDeck,
        statusText,
        toggle,
        refetch: startFinding,
        triggerTransition,
    };
};
