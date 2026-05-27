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
            const excludeIds = Array.from(playedSetRef.current).join(',');
            const response = await fetch(
                `${API_ENDPOINTS.SUGGEST}?bpm=${Math.round(currentBpm)}&exclude=${encodeURIComponent(excludeIds)}`
            );
            if (!response.ok) throw new Error('Suggest API failed');
            const suggestions = await response.json();

            if (suggestions.length > 0) {
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
    }, [tracks]);

    // Calculate loop bounds: first 8 beats from start
    const getLoopBounds = useCallback((bpm: number): { start: number; end: number } => {
        const beatsPerSecond = bpm / 60;
        const loopDuration = 8 / beatsPerSecond; // 8 beats
        return { start: 0, end: Math.max(loopDuration, 2) }; // minimum 2 seconds
    }, []);

    // Smooth volume fade using requestAnimationFrame
    const fadeVolume = useCallback((
        controls: DeckControls,
        fromVol: number,
        toVol: number,
        durationMs: number,
        onComplete?: () => void
    ) => {
        if (fadeAnimRef.current) cancelAnimationFrame(fadeAnimRef.current);

        const startTime = performance.now();
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
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

        setPhase('FINDING');
        setStatusText('Finding next track...');

        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;
        const currentBpm = activeState.track?.bpm || 120;

        const nextTrack = await findSimilarTrack(currentBpm);
        if (!nextTrack) {
            setStatusText('No matches found');
            // Retry after a delay
            setTimeout(() => {
                if (isActiveRef.current) startFinding();
            }, 5000);
            return;
        }

        if (!isActiveRef.current) return;

        // === LOADING phase ===
        setPhase('LOADING');
        setStatusText(`Loading: ${nextTrack.name.substring(0, 30)}...`);

        const idleDeckId = getIdleDeckId();
        playedSetRef.current.add(nextTrack.id);

        try {
            await onImportTrack(nextTrack, idleDeckId, true);
        } catch (e) {
            console.error('[AutoMix] Load failed:', e);
            setStatusText('Load failed, retrying...');
            setTimeout(() => {
                if (isActiveRef.current) startFinding();
            }, 3000);
            return;
        }

        if (!isActiveRef.current) return;

        // === LOOPING phase ===
        // Wait a moment for the track to fully load into the deck
        setTimeout(() => {
            if (!isActiveRef.current) return;

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
            idleControls.play();
        }, 1000);
    }, [deckAState, deckBState, findSimilarTrack, getIdleDeckId, getIdleControls, getLoopBounds, onImportTrack]);

    // === Monitor active deck for transition trigger ===
    useEffect(() => {
        if (!isActive) return;

        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;
        if (!activeState.track || !activeState.isPlaying) return;

        const timeRemaining = activeState.track.duration - activeState.currentTime;

        // Enter TRANSITIONING phase (exit loop, fade in next track, fade out current track 30s before end / rhythm down)
        if (phase === 'LOOPING' && timeRemaining <= TRANSITION_TRIGGER_SECONDS && !transitionStartedRef.current) {
            transitionStartedRef.current = true;
            setPhase('TRANSITIONING');
            setStatusText('Transitioning...');

            const idleControls = getIdleControls();
            const activeControls = getActiveControls();
            const activeState2 = activeDeckRef.current === 'A' ? deckAState : deckBState;

            // Exit the loop on the next track
            idleControls.clearLoop();

            // Fade new track from LOOP_VOLUME → 100
            fadeVolume(idleControls, LOOP_VOLUME, 100, FADE_DURATION_MS);

            // Fade old track from current volume → 0
            fadeVolume(activeControls, activeState2.volume, 0, FADE_DURATION_MS, () => {
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
        }
    }, [isActive, phase, activeDeck, deckAState, deckBState, getIdleControls, getActiveControls, getIdleDeckId, getLoopBounds, fadeVolume, startFinding]);

    // === Sync idle deck playing state with active deck playing state during LOOPING phase ===
    useEffect(() => {
        if (!isActive || phase !== 'LOOPING') return;

        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;
        const idleControls = getIdleControls();

        if (activeState.isPlaying) {
            idleControls.play();
        } else {
            idleControls.pause();
        }
    }, [isActive, phase, deckAState.isPlaying, deckBState.isPlaying, getIdleControls]);

    // === Track if the active track changed to trigger refetch ===
    const lastActiveTrackIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isActive || phase === 'IDLE') return;

        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;
        if (!activeState.track) return;

        const currentTrackId = activeState.track.id;
        if (lastActiveTrackIdRef.current && lastActiveTrackIdRef.current !== currentTrackId) {
            console.log(`[AutoMix] Active track changed from ${lastActiveTrackIdRef.current} to ${currentTrackId}. Adapting and refetching...`);
            startFinding();
        }
        lastActiveTrackIdRef.current = currentTrackId;
    }, [isActive, phase, deckAState.track?.id, deckBState.track?.id, startFinding]);

    // === Toggle Auto Mix ===
    const toggle = useCallback(() => {
        if (isActive) {
            // Turn OFF
            setIsActive(false);
            setPhase('IDLE');
            setActiveDeck(null);
            setStatusText('');
            transitionStartedRef.current = false;

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
    };
};
