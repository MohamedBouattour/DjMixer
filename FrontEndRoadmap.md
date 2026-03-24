🔴 Critical Bugs
Bug A — useDeck initialized with null AudioContext
In App.tsx, useDeck is called before the AudioContext is created :

ts
const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
// ...
const { state: deckAState, controls: deckA } = useDeck({
audioContext: audioContext!, // ← null! on first render
destination: deckAGainRef.current!, // ← also null!
});
Inside useDeck.ts, the useEffect that creates the gain + effects chain has if (!audioContext || !destination) return — so it silently does nothing. The audio chain is never wired until the user taps "Start Session". But since useDeck doesn't re-run its setup when audioContext changes from null → real context (the deps array only has [audioContext, destination], but destination is a ref value captured at call time), the effect won't re-fire reliably. Result: tracks play with no effects chain, no gain node, and no crossfader routing.

Fix: Move useDeck calls inside a conditional block or pass a stable non-null context. Better: initialize AudioContext eagerly on module load (suspended), and only call resume() on user gesture.

Bug B — endScratch uses stale state.pitch closure
In useDeck.ts :

ts
const endScratch = useCallback(() => {
isScratchingRef.current = false;
if (audioElementRef.current) {
audioElementRef.current.playbackRate = 1 + (state.pitch / 100); // ← stale closure
}
}, [state.pitch]); // ← rebuilds on every pitch change
Every time the user changes pitch, endScratch is rebuilt and passed as a new function reference to Deck → Waveform. This causes Waveform's handlePointerUp useCallback to also rebuild (since onScratchEnd is a dep), which restarts pointer capture state on mobile mid-gesture.

Fix: Use a ref for pitch inside useDeck:

ts
const pitchRef = useRef(state.pitch);
useEffect(() => { pitchRef.current = state.pitch; }, [state.pitch]);

const endScratch = useCallback(() => {
isScratchingRef.current = false;
if (audioElementRef.current) {
audioElementRef.current.playbackRate = 1 + (pitchRef.current / 100);
}
}, []); // stable forever
Bug C — Deck.tsx passes endScratch as BOTH onReleaseScratch AND onScratchEnd
In the latest Deck.tsx :

tsx
<ScrollableWaveform
onReleaseScratch={endScratch} // ← endScratch called once
onScratchEnd={endScratch} // ← endScratch called AGAIN
/>
<Waveform
onReleaseScratch={endScratch} // ← endScratch called once
onScratchEnd={endScratch} // ← endScratch called AGAIN
/>
endScratch fires twice on every scratch release — setting isScratchingRef = false twice and writing playbackRate twice. On the vinyl, during the deceleration phase in handlePointerUp, onScratch?.(scratchVelocity / 200) is still firing (velocity modulation) but isScratchingRef is already false from the first endScratch call, so setScratchRate in useDeck does nothing (guarded by if (isScratchingRef.current)). The disc decelerates visually but audio snaps back to normal rate immediately instead of decelerating with the disc.

Fix: Pick one prop — use onScratchEnd only, remove onReleaseScratch passthrough to endScratch:

tsx
<Waveform
onScratchStart={startScratch}
onScratchEnd={endScratch} // ← only this
onScratch={setScratchRate}
onSeek={seek}
// onReleaseScratch={...} ← remove or pass a no-op
/>
Bug D — updateCurrentTime rAF loop stops when isPlayingRef becomes false but never restarts
In useDeck.ts :

ts
const updateCurrentTime = useCallback(() => {
if (audioElementRef.current && isPlayingRef.current) {
// ...
animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);
}
// ← if isPlayingRef.current = false, loop just stops, no re-schedule
}, []);
When pause() is called, isPlayingRef.current = false and the loop drops. When play() is called again, it starts a new requestAnimationFrame — but updateCurrentTime captures the closure at mount time via useCallback([], []). Since updateCurrentTimeRef.current is updated, this works — except: the loop only runs when isPlayingRef.current is true, so seeking while paused never updates state.currentTime in React state, and the waveform playhead doesn't move when you drag while paused.

Fix: Always reschedule, use the ref flag only to update state:

ts
const updateCurrentTime = useCallback(() => {
if (audioElementRef.current) {
// Always update currentTime if audio element exists
const ct = audioElementRef.current.currentTime;
setState(prev => prev.currentTime !== ct ? { ...prev, currentTime: ct } : prev);
}
if (isPlayingRef.current) {
animationFrameRef.current = requestAnimationFrame(updateCurrentTimeRef.current);
}
}, []);
And in seek(), call setState directly for immediate visual update:

ts
const seek = useCallback((time: number) => {
if (audioElementRef.current) {
audioElementRef.current.currentTime = time;
setState(prev => ({ ...prev, currentTime: time })); // ← immediate update
}
}, []);
Bug E — useDeck loadTrack creates a new Audio element but doesn't revoke the previous blob URL
ts
const audio = new Audio(track.url);
audioElementRef.current = audio;
The old audioElementRef.current is replaced without calling URL.revokeObjectURL() on the previous blob URL . Over multiple track loads, memory leaks accumulate. On mobile with 512MB RAM, this can crash the tab after 3–4 track switches.

Fix:

ts
// Before creating new Audio:
if (audioElementRef.current?.src?.startsWith('blob:')) {
URL.revokeObjectURL(audioElementRef.current.src);
}
🟡 Medium Bugs
Bug F — Waveform.tsx: vinyl-container class, but CSS uses waveform-vinyl-container
The latest Waveform.tsx correctly renders className="waveform-vinyl-container" , but Waveform.css still has the old unprefixed selectors (.vinyl-container, .vinyl-disc, etc.) from before the CSS rename refactor . The outer glow ring ::before pseudo-element, the is-playing state, and the responsive max-width override all target .vinyl-container — none of them apply to the renamed element.

Fix: Update Waveform.css to rename all selectors from .vinyl-_ → .waveform-vinyl-_ to match the new TSX class names.

Bug G — ScrollableWaveform height passed via window.innerWidth at render time
In Deck.tsx :

tsx
height={window.innerWidth <= 767 ? 52 : (window.innerWidth < 1200 ... ? 65 : 78)}
This is read once at render, never updated on resize. Rotating a tablet or resizing the browser → wrong waveform height, canvas is drawn at wrong pixel dimensions → blurry or clipped waveform.

Fix: Use the existing isMobile state already computed in App.tsx, or add a resize listener inside Deck:

tsx
const [waveHeight, setWaveHeight] = useState(() =>
window.innerWidth <= 767 ? 52 : window.innerWidth < 1200 ? 65 : 78
);
useEffect(() => {
const handleResize = () => setWaveHeight(
window.innerWidth <= 767 ? 52 : window.innerWidth < 1200 ? 65 : 78
);
window.addEventListener('resize', handleResize);
return () => window.removeEventListener('resize', handleResize);
}, []);
Bug H — useDeck setIsLoading not in controls type in Deck.tsx
The DeckProps.controls interface in Deck.tsx does not include setIsLoading , but useDeck exports it and App.tsx calls deck.setIsLoading(true) directly . This is a TypeScript gap — if Deck ever needs to trigger loading state it can't, and TypeScript won't catch misuse of the controls object passed around.

Priority Fix Order

# Bug File Severity Effort

# Bug File Severity Effort

A Null AudioContext → broken audio chain App.tsx + useDeck.ts 🔴 Critical 2h
C endScratch fires twice → disc decel broken Deck.tsx 🔴 Critical 15min
B Stale state.pitch in endScratch useDeck.ts 🔴 Critical 30min
D rAF loop stops on pause → seek while paused broken useDeck.ts 🔴 Critical 30min
F CSS class mismatch .vinyl-_ vs .waveform-vinyl-_ Waveform.css 🔴 Critical 30min
E Blob URL memory leak on track reload useDeck.ts 🟡 Medium 15min
G Static window.innerWidth for waveform height Deck.tsx 🟡 Medium 20min
H Missing setIsLoading in controls type Deck.tsx 🟡 Low 5min
Bugs C + F are the fastest wins — both can be fixed in under an hour and will immediately restore vinyl deceleration physics and the vinyl CSS appearance. Bug A is the root cause of any silent audio issues on first session start.
