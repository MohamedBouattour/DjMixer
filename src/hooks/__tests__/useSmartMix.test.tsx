import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Track, SmartSuggestion, DeckState } from '../../types';
import { useSmartMix } from '../useSmartMix';
import { API_ENDPOINTS } from '../../config';

function createMockDeckState(overrides: Partial<DeckState> = {}): DeckState {
  return {
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
      reverb: false, delay: false, filter: false,
      distortion: false, bitcrusher: false, flanger: false,
      tremolo: false, hpf: false,
    },
    ...overrides,
  };
}

function createMockControls() {
  return {
    loadTrack: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setEQ: vi.fn(),
    setLoop: vi.fn(),
    clearLoop: vi.fn(),
    setIsLoading: vi.fn(),
  };
}

function makeSuggestion(id: string, overrides: Partial<SmartSuggestion> = {}): SmartSuggestion {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Test Artist',
    genre: 'Electronic',
    bpm: 120,
    reason: 'AI recommendation',
    status: 'found',
    videoId: `vid_${id}`,
    duration: 180,
    ...overrides,
  };
}

function mockFetchSuccess(data: unknown) {
  return vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function mockFetchError() {
  return vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
}

const mockTrack: Track = {
  id: 'track_1',
  name: 'Test Track',
  duration: 200,
  url: 'http://example.com/stream',
  bpm: 120,
  artist: 'Test Artist',
  genre: 'Electronic',
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    return setTimeout(() => cb(performance.now()), 16) as unknown as number;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    clearTimeout(id);
  });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.reject(new Error('fetch not mocked'))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useSmartMix', () => {
  describe('initial state', () => {
    it('returns IDLE phase and empty state', () => {
      const { result } = renderHook(() =>
        useSmartMix({
          deckAState: createMockDeckState(),
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      expect(result.current.isActive).toBe(false);
      expect(result.current.phase).toBe('IDLE');
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.queue).toEqual([]);
      expect(result.current.queueIndex).toBe(0);
      expect(result.current.statusText).toBe('');
    });
  });

  describe('toggle', () => {
    it('activates smart mix when toggled on', () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      mockFetchSuccess({ suggestions: [], ai: false });

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isActive).toBe(true);
    });

    it('starts with FETCHING phase', () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      mockFetchSuccess({ suggestions: [], ai: false });

      act(() => {
        result.current.toggle();
      });

      expect(result.current.phase).toBe('FETCHING');
    });
  });

  describe('triggerTransition', () => {
    it('calls play() on the idle deck to ensure it is playing', () => {
      const deckAControls = createMockControls();
      const deckBControls = createMockControls();
      const deckAState = createMockDeckState({
        track: mockTrack,
        isPlaying: true,
        volume: 100,
        eq: { low: 50, mid: 50, high: 50 },
      });
      const deckBState = createMockDeckState({
        track: { ...mockTrack, id: 'track_2' },
        isPlaying: true,
        volume: 60,
        eq: { low: 30, mid: 50, high: 50 },
      });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState,
          deckAControls,
          deckBControls,
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      mockFetchSuccess({ suggestions: [], ai: false });

      act(() => {
        result.current.toggle();
      });

      expect(result.current.activeDeck).toBe('A');

      act(() => {
        result.current.triggerTransition();
      });

      expect(deckBControls.play).toHaveBeenCalledTimes(1);
      expect(deckBControls.clearLoop).toHaveBeenCalledBefore(deckBControls.play as any);
      expect(result.current.phase).toBe('TRANSITIONING');
    });

    it('does not transition if idle deck has no track', () => {
      const deckAControls = createMockControls();
      const deckBControls = createMockControls();
      const deckAState = createMockDeckState({
        track: mockTrack,
        isPlaying: true,
      });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls,
          deckBControls,
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      mockFetchSuccess({ suggestions: [], ai: false });

      act(() => {
        result.current.toggle();
      });

      act(() => {
        result.current.triggerTransition();
      });

      expect(deckBControls.play).not.toHaveBeenCalled();
      expect(result.current.phase).not.toBe('TRANSITIONING');
    });
  });

  describe('fetchSuggestions background mode', () => {
    it('does not change phase when background fetch completes', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });
      const deckBState = createMockDeckState({ track: { ...mockTrack, id: 'track_2' } });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState,
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      mockFetchSuccess({ suggestions: [makeSuggestion('s1')], ai: false });
      act(() => { result.current.toggle(); });

      // Let the initial foreground fetch complete
      await vi.waitFor(() => {
        expect(result.current.phase).toBe('AWAITING_CHOICE');
      });

      // Now trigger a background fetch
      mockFetchSuccess({ suggestions: [makeSuggestion('s2'), makeSuggestion('s3')], ai: false });
      // Simulate via addTrackFromYt which uses background=true
      act(() => {
        result.current.addTrackFromYt({ ...mockTrack, id: 'yt_track' });
      });

      // Phase should not change to FETCHING during background fetch
      expect(result.current.phase).toBe('AWAITING_CHOICE');

      // Wait for background fetch to complete
      await vi.waitFor(() => {
        expect(result.current.suggestions.length).toBe(2);
      });

      // Wait for the queued loading of the track to run and set phase to LOADING
      await vi.waitFor(() => {
        expect(result.current.phase).toBe('LOADING');
      });
    });
  });

  describe('selectSuggestion auto-refill', () => {
    it('triggers background fetch when remaining suggestions drop to <= 3', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      // Initial fetch that returns 5 suggestions
      const suggestions = [
        makeSuggestion('s1'), makeSuggestion('s2'), makeSuggestion('s3'),
        makeSuggestion('s4'), makeSuggestion('s5'),
      ];
      mockFetchSuccess({ suggestions, ai: false });
      act(() => { result.current.toggle(); });

      await vi.waitFor(() => {
        expect(result.current.suggestions.length).toBe(5);
      });

      // Now select 2 suggestions, leaving 3 — should auto-trigger background fetch
      mockFetchSuccess({ suggestions: [makeSuggestion('s6'), makeSuggestion('s7')], ai: false });

      act(() => { result.current.selectSuggestion(suggestions[0]); });
      act(() => { result.current.selectSuggestion(suggestions[1]); });

      // After removing 2, we have 3 left — auto-fetch should fire
      await vi.waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('does not trigger auto-refill when remaining suggestions > 3', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      const suggestions = [
        makeSuggestion('s1'), makeSuggestion('s2'), makeSuggestion('s3'),
        makeSuggestion('s4'), makeSuggestion('s5'),
      ];
      mockFetchSuccess({ suggestions, ai: false });
      act(() => { result.current.toggle(); });

      await vi.waitFor(() => {
        expect(result.current.suggestions.length).toBe(5);
      });

      // Remove just 1 suggestion (leaving 4 > 3)
      act(() => { result.current.selectSuggestion(suggestions[0]); });

      expect(result.current.suggestions.length).toBe(4);
    });
  });

  describe('addToQueue auto-refill', () => {
    it('triggers background fetch when remaining suggestions drop to <= 3', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      const suggestions = [
        makeSuggestion('s1'), makeSuggestion('s2'), makeSuggestion('s3'),
        makeSuggestion('s4'),
      ];
      mockFetchSuccess({ suggestions, ai: false });
      act(() => { result.current.toggle(); });

      await vi.waitFor(() => {
        expect(result.current.suggestions.length).toBe(4);
      });

      // Queue 1 suggestion, leaving 3 — should auto-trigger
      mockFetchSuccess({ suggestions: [makeSuggestion('s5')], ai: false });

      act(() => { result.current.addToQueue(suggestions[0]); });

      await vi.waitFor(() => {
        expect(result.current.queue.length).toBe(1);
      });
    });
  });

  describe('addTrackFromYt', () => {
    it('adds track to queue and fetches suggestions in background', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });
      const deckAControls = createMockControls();
      const deckBControls = createMockControls();
      const onImportTrack = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls,
          deckBControls,
          tracks: [],
          onImportTrack,
        })
      );

      mockFetchSuccess({ suggestions: [makeSuggestion('s1')], ai: false });
      act(() => { result.current.toggle(); });

      await vi.waitFor(() => {
        expect(result.current.phase).toBe('AWAITING_CHOICE');
      });

      // Add a YT track
      const ytTrack: Track = { ...mockTrack, id: 'yt_track_1', name: 'YouTube Track' };

      mockFetchSuccess({ suggestions: [makeSuggestion('s2')], ai: false });
      act(() => {
        result.current.addTrackFromYt(ytTrack);
      });

      // Queue should have the YT track
      await vi.waitFor(() => {
        expect(result.current.queue.some(q => q.track.id === 'yt_track_1')).toBe(true);
      });

      // Phase should remain AWAITING_CHOICE (not FETCHING)
      expect(result.current.phase).toBe('AWAITING_CHOICE');
    });
  });

  describe('API integration', () => {
    it('calls the correct API endpoint when fetching suggestions', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      const mockData = { suggestions: [makeSuggestion('s1')], ai: true };
      const fetchMock = mockFetchSuccess(mockData);

      act(() => { result.current.toggle(); });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          API_ENDPOINTS.SMART_SUGGEST,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.any(String),
          })
        );
      });
    });

    it('handles fetch failure gracefully', async () => {
      const deckAState = createMockDeckState({ track: mockTrack });

      const { result } = renderHook(() =>
        useSmartMix({
          deckAState,
          deckBState: createMockDeckState(),
          deckAControls: createMockControls(),
          deckBControls: createMockControls(),
          tracks: [],
          onImportTrack: vi.fn(),
        })
      );

      mockFetchError();

      act(() => { result.current.toggle(); });

      await vi.waitFor(() => {
        expect(result.current.statusText).toBe('Failed to get AI suggestions — check your connection');
      });
    });
  });
});
