import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track, SmartSuggestion, SmartMixQueueItem, SmartMixPhase, DeckState } from '../types';
import { API_ENDPOINTS } from '../config';

interface DeckControls {
    loadTrack: (track: Track) => Promise<void>;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setVolume: (update: number | ((prev: number) => number)) => void;
    setEQ: (band: 'low' | 'mid' | 'high', value: number) => void;
    setLoop: (start: number, end: number) => void;
    clearLoop: () => void;
    setIsLoading: (isLoading: boolean) => void;
}

interface UseSmartMixOptions {
    deckAState: DeckState;
    deckBState: DeckState;
    deckAControls: DeckControls;
    deckBControls: DeckControls;
    tracks: Track[];
    onImportTrack: (track: Track, deckId: 'A' | 'B', silent?: boolean) => Promise<void>;
}

const TRANSITION_TRIGGER_SECONDS = 30;
const FADE_DURATION_MS = 8000;
const LOOP_VOLUME = 60;
const COOLDOWN_MS = 3000;

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useSmartMix = ({
    deckAState,
    deckBState,
    deckAControls,
    deckBControls,
    onImportTrack,
}: UseSmartMixOptions) => {
    const [isActive, setIsActive] = useState(false);
    const [phase, setPhase] = useState<SmartMixPhase>('IDLE');
    const [activeDeck, setActiveDeck] = useState<'A' | 'B' | null>(null);
    const [statusText, setStatusText] = useState('');
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [isAiPowered, setIsAiPowered] = useState(false);
    const [queue, setQueue] = useState<SmartMixQueueItem[]>([]);
    const [queueIndex, setQueueIndex] = useState(0);

    const isActiveRef = useRef(false);
    const phaseRef = useRef<SmartMixPhase>('IDLE');
    const activeDeckRef = useRef<'A' | 'B' | null>(null);
    const playedSetRef = useRef<Set<string>>(new Set());
    const fadeActiveAnimRef = useRef<number | null>(null);
    const fadeIdleAnimRef = useRef<number | null>(null);
    const fadeActiveEQAnimRef = useRef<number | null>(null);
    const fadeIdleEQAnimRef = useRef<number | null>(null);
    const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionStartedRef = useRef(false);
    const currentSearchIdRef = useRef(0);
    const isFetchingRef = useRef(false);
    const queueRef = useRef<SmartMixQueueItem[]>([]);
    const queueIndexRef = useRef(0);
    const suggestionsRef = useRef<SmartSuggestion[]>([]);

    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { activeDeckRef.current = activeDeck; }, [activeDeck]);
    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
    useEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);

    const getIdleDeckId = useCallback((): 'A' | 'B' => {
        return activeDeckRef.current === 'A' ? 'B' : 'A';
    }, []);

    const getIdleControls = useCallback((): DeckControls => {
        return activeDeckRef.current === 'A' ? deckBControls : deckAControls;
    }, [deckAControls, deckBControls]);

    const getActiveControls = useCallback((): DeckControls => {
        return activeDeckRef.current === 'A' ? deckAControls : deckBControls;
    }, [deckAControls, deckBControls]);

    const activeIsPlayingRef = useRef(false);
    useEffect(() => {
        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        activeIsPlayingRef.current = activeState.isPlaying;
    }, [activeDeck, deckAState.isPlaying, deckBState.isPlaying]);

    const getLoopBounds = useCallback((bpm: number): { start: number; end: number } => {
        const beatsPerSecond = bpm / 60;
        const loopDuration = 8 / beatsPerSecond;
        return { start: 0, end: Math.max(loopDuration, 2) };
    }, []);

    const fadeVolume = useCallback((
        controls: DeckControls,
        fromVol: number,
        toVol: number,
        durationMs: number,
        isIdleDeck: boolean,
        onComplete?: () => void
    ) => {
        const animRef = isIdleDeck ? fadeIdleAnimRef : fadeActiveAnimRef;
        if (animRef.current) cancelAnimationFrame(animRef.current);
        let elapsedMs = 0;
        let lastTime = performance.now();

        const animate = (now: number) => {
            const delta = now - lastTime;
            lastTime = now;
            if (activeIsPlayingRef.current) elapsedMs += delta;
            const progress = Math.min(elapsedMs / durationMs, 1);
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            controls.setVolume(Math.round(fromVol + (toVol - fromVol) * eased));
            if (progress < 1) {
                animRef.current = requestAnimationFrame(animate);
            } else {
                animRef.current = null;
                onComplete?.();
            }
        };
        animRef.current = requestAnimationFrame(animate);
    }, []);

    const fadeEQ = useCallback((
        controls: DeckControls,
        band: 'low' | 'mid' | 'high',
        fromVal: number,
        toVal: number,
        durationMs: number,
        isIdleDeck: boolean
    ) => {
        const animRef = isIdleDeck ? fadeIdleEQAnimRef : fadeActiveEQAnimRef;
        if (animRef.current) cancelAnimationFrame(animRef.current);
        let elapsedMs = 0;
        let lastTime = performance.now();

        const animate = (now: number) => {
            const delta = now - lastTime;
            lastTime = now;
            if (activeIsPlayingRef.current) elapsedMs += delta;
            const progress = Math.min(elapsedMs / durationMs, 1);
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            controls.setEQ(band, Math.round(fromVal + (toVal - fromVal) * eased));
            if (progress < 1) {
                animRef.current = requestAnimationFrame(animate);
            } else {
                animRef.current = null;
            }
        };
        animRef.current = requestAnimationFrame(animate);
    }, []);

    const fetchSuggestions = useCallback(async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        setPhase('FETCHING');
        setStatusText('AI is finding your next tracks...');
        setIsAiPowered(false);

        const searchId = ++currentSearchIdRef.current;

        try {
            const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;
            const currentTrack = activeState.track;

            const response = await fetch(API_ENDPOINTS.SMART_SUGGEST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bpm: currentTrack?.bpm || 120,
                    name: currentTrack?.name || '',
                    artist: currentTrack?.artist || '',
                    genre: currentTrack?.genre || '',
                    playedIds: Array.from(playedSetRef.current),
                }),
            });

            if (searchId !== currentSearchIdRef.current || !isActiveRef.current) return;

            if (!response.ok) throw new Error('Smart suggest failed');

            const data = await response.json();
            if (searchId !== currentSearchIdRef.current || !isActiveRef.current) return;

            const newSuggestions: SmartSuggestion[] = (data.suggestions || []).map((s: any) => ({
                id: s.id || generateId(),
                title: s.title || 'Unknown Track',
                artist: s.artist || 'Unknown Artist',
                genre: s.genre || 'Electronic',
                bpm: s.bpm || 120,
                reason: s.reason || 'AI recommendation',
                status: s.status || 'found',
                thumbnail: s.thumbnail,
                duration: s.duration,
                videoId: s.videoId,
            }));

            setSuggestions(newSuggestions);
            setIsAiPowered(data.ai === true);
            setStatusText(newSuggestions.length > 0
                ? 'Choose your next track'
                : 'No suggestions found — retrying...'
            );
            setPhase('AWAITING_CHOICE');
        } catch (e) {
            console.warn('[SmartMix] Fetch suggestions failed:', e);
            if (searchId === currentSearchIdRef.current && isActiveRef.current) {
                setStatusText('Failed to get AI suggestions — check your connection');
                setTimeout(() => {
                    if (isActiveRef.current && searchId === currentSearchIdRef.current) {
                        fetchSuggestions();
                    }
                }, 5000);
            }
        } finally {
            isFetchingRef.current = false;
        }
    }, [deckAState, deckBState]);

    const loadNextFromQueue = useCallback(async () => {
        if (!isActiveRef.current) return;
        const searchId = ++currentSearchIdRef.current;

        const currentQueue = queueRef.current;
        const currentIdx = queueIndexRef.current;
        if (currentQueue.length === 0 || currentIdx >= currentQueue.length) {
            const currentSuggestions = suggestionsRef.current;
            if (currentSuggestions.length > 0) {
                setPhase('AWAITING_CHOICE');
                setStatusText('Choose your next track');
            } else {
                fetchSuggestions();
            }
            return;
        }

        const item = currentQueue[currentIdx];
        setPhase('LOADING');
        setStatusText(`Loading: ${item.track.name.substring(0, 30)}...`);

        const idleDeckId = getIdleDeckId();
        playedSetRef.current.add(item.track.id);

        try {
            await onImportTrack(item.track, idleDeckId, true);
        } catch (e) {
            console.error('[SmartMix] Load failed:', e);
            if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;
            setQueueIndex(prev => prev + 1);
            setTimeout(() => {
                if (isActiveRef.current && searchId === currentSearchIdRef.current) {
                    loadNextFromQueue();
                }
            }, 3000);
            return;
        }

        if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;

        setTimeout(() => {
            if (!isActiveRef.current || searchId !== currentSearchIdRef.current) return;

            setPhase('LOOPING');
            setStatusText('Next track ready — looping...');
            transitionStartedRef.current = false;

            const idleControls = getIdleControls();
            const bpm = item.track.bpm || 120;
            const { start, end } = getLoopBounds(bpm);

            idleControls.setVolume(LOOP_VOLUME);
            idleControls.setEQ('low', 30); // Keep bass low while looping
            idleControls.seek(start);
            idleControls.setLoop(start, end);
            idleControls.play();
        }, 1000);
    }, [getIdleDeckId, getIdleControls, getLoopBounds, onImportTrack, fetchSuggestions]);

    const triggerTransition = useCallback(() => {
        const idleDeckId = activeDeckRef.current === 'A' ? 'B' : 'A';
        const idleState = idleDeckId === 'A' ? deckAState : deckBState;

        if (!isActiveRef.current || !idleState.track || transitionStartedRef.current) {
            return;
        }

        transitionStartedRef.current = true;
        setPhase('TRANSITIONING');
        setStatusText('Transitioning...');

        const idleControls = getIdleControls();
        const activeControls = getActiveControls();
        const activeState = activeDeckRef.current === 'A' ? deckAState : deckBState;

        idleControls.clearLoop();

        // Crossover volume and EQ:
        // Fade incoming track from LOOP_VOLUME (60) to 150 (max volume), and low EQ from 30 to 50
        fadeVolume(idleControls, LOOP_VOLUME, 150, FADE_DURATION_MS, true);
        fadeEQ(idleControls, 'low', 30, 50, FADE_DURATION_MS, true);

        // Fade outgoing track volume to 0, and Low EQ from current to 0 (bass cut)
        fadeEQ(activeControls, 'low', activeState.eq.low, 0, FADE_DURATION_MS, false);
        fadeVolume(activeControls, activeState.volume, 0, FADE_DURATION_MS, false, () => {
            if (!isActiveRef.current) return;

            activeControls.pause();
            activeControls.setVolume(150); // Reset volume to max
            activeControls.setEQ('low', 50); // Reset EQs to flat
            activeControls.setEQ('mid', 50);
            activeControls.setEQ('high', 50);

            const newActiveDeck = getIdleDeckId();
            setActiveDeck(newActiveDeck);

            setPhase('COOLDOWN');
            setStatusText('Preparing next...');

            cooldownTimerRef.current = setTimeout(() => {
                if (isActiveRef.current) {
                    const next = queueIndexRef.current + 1;
                    queueIndexRef.current = next;
                    setQueueIndex(next);
                    loadNextFromQueue();
                }
            }, COOLDOWN_MS);
        });
    }, [getIdleControls, getActiveControls, getIdleDeckId, fadeVolume, fadeEQ, deckAState, deckBState]);

    useEffect(() => {
        if (!isActive) return;
        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        if (!activeState.track || !activeState.isPlaying) return;
        const timeRemaining = activeState.track.duration - activeState.currentTime;
        if (phase === 'LOOPING' && timeRemaining <= TRANSITION_TRIGGER_SECONDS && !transitionStartedRef.current) {
            triggerTransition();
        }
    }, [isActive, phase, activeDeck, deckAState.currentTime, deckAState.track?.duration, deckAState.isPlaying, deckBState.currentTime, deckBState.track?.duration, deckBState.isPlaying, triggerTransition]);

    const selectSuggestion = useCallback((suggestion: SmartSuggestion) => {
        if (suggestion.status !== 'found' || !suggestion.videoId) return;

        const track: Track = {
            id: suggestion.videoId,
            name: suggestion.title,
            duration: suggestion.duration || 180,
            url: `${API_ENDPOINTS.STREAM}?videoId=${suggestion.videoId}`,
            bpm: suggestion.bpm,
            artist: suggestion.artist,
            genre: suggestion.genre,
            thumbnail: suggestion.thumbnail,
        };

        const queueItem: SmartMixQueueItem = {
            id: generateId(),
            track,
            suggestion,
        };

        setQueue(prev => {
            const idx = prev.length;
            const notLoading = phaseRef.current !== 'LOADING' && phaseRef.current !== 'LOOPING' && phaseRef.current !== 'TRANSITIONING' && phaseRef.current !== 'COOLDOWN';
            const nextQueue = [...prev, queueItem];
            queueRef.current = nextQueue;
            if (notLoading) {
                setTimeout(() => {
                    if (isActiveRef.current) {
                        queueIndexRef.current = idx;
                        setQueueIndex(idx);
                        loadNextFromQueue();
                    }
                }, 100);
            }
            return nextQueue;
        });

        const remainingCount = suggestionsRef.current.length;
        setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
        setStatusText('Added to queue');
        setTimeout(() => {
            if (isActiveRef.current) {
                setStatusText(remainingCount > 1 ? 'Choose more or start mixing' : 'Queue ready — mixing!');
            }
        }, 1500);
    }, [loadNextFromQueue]);

    const queueAll = useCallback(() => {
        const found = suggestionsRef.current.filter(s => s.status === 'found' && s.videoId);
        if (found.length === 0) return;

        const newItems: SmartMixQueueItem[] = found.map(s => ({
            id: generateId(),
            track: {
                id: s.videoId!,
                name: s.title,
                duration: s.duration || 180,
                url: `${API_ENDPOINTS.STREAM}?videoId=${s.videoId}`,
                bpm: s.bpm,
                artist: s.artist,
                genre: s.genre,
                thumbnail: s.thumbnail,
            },
            suggestion: s,
        }));

        setQueue(prev => {
            const startIdx = prev.length;
            const notLoading = phaseRef.current !== 'LOADING' && phaseRef.current !== 'LOOPING' && phaseRef.current !== 'TRANSITIONING' && phaseRef.current !== 'COOLDOWN';
            const nextQueue = [...prev, ...newItems];
            queueRef.current = nextQueue;
            if (notLoading) {
                setTimeout(() => {
                    if (isActiveRef.current) {
                        queueIndexRef.current = startIdx;
                        setQueueIndex(startIdx);
                        loadNextFromQueue();
                    }
                }, 100);
            }
            return nextQueue;
        });

        setSuggestions([]);
        setStatusText(`Queued ${newItems.length} tracks`);
    }, [loadNextFromQueue]);

    const addToQueue = useCallback((suggestion: SmartSuggestion) => {
        if (suggestion.status !== 'found' || !suggestion.videoId) return;
        const track: Track = {
            id: suggestion.videoId,
            name: suggestion.title,
            duration: suggestion.duration || 180,
            url: `${API_ENDPOINTS.STREAM}?videoId=${suggestion.videoId}`,
            bpm: suggestion.bpm,
            artist: suggestion.artist,
            genre: suggestion.genre,
            thumbnail: suggestion.thumbnail,
        };
        setQueue(prev => {
            const nextQueue = [...prev, { id: generateId(), track, suggestion }];
            queueRef.current = nextQueue;
            return nextQueue;
        });
        setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    }, []);

    const removeFromQueue = useCallback((itemId: string) => {
        const currentIdx = queueIndexRef.current;
        setQueue(prev => {
            const index = prev.findIndex(i => i.id === itemId);
            if (index < 0) return prev;
            const newQueue = prev.filter(i => i.id !== itemId);
            queueRef.current = newQueue;
            if (index < currentIdx) {
                const nextIdx = Math.max(0, currentIdx - 1);
                queueIndexRef.current = nextIdx;
                setQueueIndex(nextIdx);
            }
            return newQueue;
        });
    }, []);

    const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
        setQueue(prev => {
            const newQueue = [...prev];
            const [moved] = newQueue.splice(fromIndex, 1);
            newQueue.splice(toIndex, 0, moved);
            queueRef.current = newQueue;
            return newQueue;
        });
    }, []);

    const refreshSuggestions = useCallback(() => {
        setSuggestions([]);
        fetchSuggestions();
    }, [fetchSuggestions]);

    const clearQueue = useCallback(() => {
        queueRef.current = [];
        queueIndexRef.current = 0;
        setQueue([]);
        setQueueIndex(0);
    }, []);

    const lastActiveTrackIdRef = useRef<string | null>(null);
    const lastActiveDeckRef = useRef<'A' | 'B' | null>(null);

    useEffect(() => {
        if (!isActive || phase === 'IDLE') return;
        const activeState = activeDeck === 'A' ? deckAState : deckBState;
        if (!activeState.track) return;

        const currentTrackId = activeState.track.id;
        const deckHasChanged = lastActiveDeckRef.current !== activeDeck;
        const trackHasChanged = lastActiveTrackIdRef.current && lastActiveTrackIdRef.current !== currentTrackId;

        if (!deckHasChanged && trackHasChanged) {
            currentSearchIdRef.current++;
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
            if (fadeActiveAnimRef.current) {
                cancelAnimationFrame(fadeActiveAnimRef.current);
                fadeActiveAnimRef.current = null;
            }
            if (fadeIdleAnimRef.current) {
                cancelAnimationFrame(fadeIdleAnimRef.current);
                fadeIdleAnimRef.current = null;
            }
            if (fadeActiveEQAnimRef.current) {
                cancelAnimationFrame(fadeActiveEQAnimRef.current);
                fadeActiveEQAnimRef.current = null;
            }
            if (fadeIdleEQAnimRef.current) {
                cancelAnimationFrame(fadeIdleEQAnimRef.current);
                fadeIdleEQAnimRef.current = null;
            }
            transitionStartedRef.current = false;
            queueRef.current = [];
            queueIndexRef.current = 0;
            setQueue([]);
            setQueueIndex(0);
            setSuggestions([]);
            fetchSuggestions();
        }

        lastActiveTrackIdRef.current = currentTrackId;
        lastActiveDeckRef.current = activeDeck;
    }, [isActive, phase, activeDeck, deckAState.track?.id, deckBState.track?.id, fetchSuggestions]);

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
                currentSearchIdRef.current++;
                if (cooldownTimerRef.current) {
                    clearTimeout(cooldownTimerRef.current);
                    cooldownTimerRef.current = null;
                }
                setPhase('LOOPING');
                setStatusText(`Manual track ready: ${idleState.track.name.substring(0, 20)}`);
                transitionStartedRef.current = false;
                const bpm = idleState.track.bpm || 120;
                const { start, end } = getLoopBounds(bpm);
                idleControls.setVolume(LOOP_VOLUME);
                idleControls.setEQ('low', 30); // Keep bass low while looping
                idleControls.seek(start);
                idleControls.setLoop(start, end);
                idleControls.play();
            }
        }
        lastIdleTrackIdRef.current = currentIdleTrackId;
    }, [isActive, phase, activeDeck, deckAState.track?.id, deckBState.track?.id, deckAState.isPlaying, deckBState.isPlaying, getLoopBounds, deckAControls, deckBControls]);

    const toggle = useCallback(() => {
        if (isActive) {
            setIsActive(false);
            setPhase('IDLE');
            setActiveDeck(null);
            setStatusText('');
            queueRef.current = [];
            queueIndexRef.current = 0;
            setQueue([]);
            setQueueIndex(0);
            setSuggestions([]);
            setIsAiPowered(false);
            transitionStartedRef.current = false;
            currentSearchIdRef.current++;
            isFetchingRef.current = false;
            if (fadeActiveAnimRef.current) {
                cancelAnimationFrame(fadeActiveAnimRef.current);
                fadeActiveAnimRef.current = null;
            }
            if (fadeIdleAnimRef.current) {
                cancelAnimationFrame(fadeIdleAnimRef.current);
                fadeIdleAnimRef.current = null;
            }
            if (fadeActiveEQAnimRef.current) {
                cancelAnimationFrame(fadeActiveEQAnimRef.current);
                fadeActiveEQAnimRef.current = null;
            }
            if (fadeIdleEQAnimRef.current) {
                cancelAnimationFrame(fadeIdleEQAnimRef.current);
                fadeIdleEQAnimRef.current = null;
            }
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
        } else {
            let startDeck: 'A' | 'B' = 'A';
            if (deckBState.isPlaying && !deckAState.isPlaying) startDeck = 'B';
            else if (deckAState.isPlaying && !deckBState.isPlaying) startDeck = 'A';
            else if (deckAState.isPlaying && deckBState.isPlaying) {
                const aRemaining = (deckAState.track?.duration || 0) - deckAState.currentTime;
                const bRemaining = (deckBState.track?.duration || 0) - deckBState.currentTime;
                startDeck = aRemaining >= bRemaining ? 'A' : 'B';
            } else {
                if (deckAState.track) startDeck = 'A';
                else if (deckBState.track) startDeck = 'B';
                else {
                    setStatusText('Load a track first!');
                    setTimeout(() => setStatusText(''), 2000);
                    return;
                }
            }

            if (deckAState.track) playedSetRef.current.add(deckAState.track.id);
            if (deckBState.track) playedSetRef.current.add(deckBState.track.id);

            setIsActive(true);
            setActiveDeck(startDeck);
            setStatusText('Smart Mix ON — finding tracks...');

            isActiveRef.current = true;
            activeDeckRef.current = startDeck;
            phaseRef.current = 'FETCHING';

            const controls = startDeck === 'A' ? deckAControls : deckBControls;
            const state = startDeck === 'A' ? deckAState : deckBState;
            if (!state.isPlaying && state.track) controls.play();

            fetchSuggestions();
        }
    }, [isActive, deckAState, deckBState, deckAControls, deckBControls, fetchSuggestions]);

    useEffect(() => {
        return () => {
            currentSearchIdRef.current++;
            if (fadeActiveAnimRef.current) cancelAnimationFrame(fadeActiveAnimRef.current);
            if (fadeIdleAnimRef.current) cancelAnimationFrame(fadeIdleAnimRef.current);
            if (fadeActiveEQAnimRef.current) cancelAnimationFrame(fadeActiveEQAnimRef.current);
            if (fadeIdleEQAnimRef.current) cancelAnimationFrame(fadeIdleEQAnimRef.current);
            if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        };
    }, []);

    return {
        isActive,
        phase,
        activeDeck,
        statusText,
        suggestions,
        queue,
        queueIndex,
        isAiPowered,
        toggle,
        selectSuggestion,
        queueAll,
        addToQueue,
        removeFromQueue,
        reorderQueue,
        refreshSuggestions,
        clearQueue,
        triggerTransition,
    };
};
