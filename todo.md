Root Cause Summary
There are 10 confirmed bugs — 5 critical (🔴) causing the blinking/audio-continue issues, and 5 performance (🟡) causing CPU drain on mobile. They split across three layers:

Layer Bug Impact
Animation loop rAF killed/restarted on isPlaying flip 🔴 Visual blink
Audio contract onScratch(0) doesn't stop audio 🔴 Song continues on hold
CSS vs rAF conflict subtle-pulse animation + inline transform fight 🔴 Disc flicker
Drag vs playback No pause signal on waveform drag 🔴 Waveform snaps
CPU 260 gradient objects/frame on mobile 🔴 Battery drain
🔴 Critical Bug Deep Dives
Bug 1 — Vinyl Blinks on Play/Pause
Waveform.tsx starts the requestAnimationFrame loop inside a useEffect([isPlaying]) . Every time isPlaying flips, the loop is cancelled and a new one starts — creating a ~1 frame visual gap where disc.style.transform is not updated, causing a flash. Additionally, lastTimeRef is reset to performance.now() on every flip, so the first rendered frame after unpausing always has deltaTime ≈ 0ms, producing a stutter instead of smooth continuation.

Fix: Move the rAF loop outside the isPlaying dependency — run it always, but only advance rotationRef when isPlaying && !isTouchingRef.current. The isPlaying ref (not state) controls the logic branch, not the loop lifecycle.

tsx
// ✅ CORRECT — single persistent loop
const isPlayingRef = useRef(isPlaying);
useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

useEffect(() => {
const animate = (now: number) => {
if (isPlayingRef.current && !isTouchingRef.current && discRef.current) {
const delta = now - lastTimeRef.current;
rotationRef.current += (33.33 / 60) _ 360 _ delta / 1000;
discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
}
lastTimeRef.current = now; // ← always update here, no else branch
animationRef.current = requestAnimationFrame(animate);
};
animationRef.current = requestAnimationFrame(animate);
return () => cancelAnimationFrame(animationRef.current!);
}, []); // ← empty deps: ONE loop, forever
Bug 2 — Hold Vinyl: Audio Keeps Playing
handlePointerDown calls onScratch(0) . A velocity of 0 in the audio engine means "scratch at 0 speed" — but that's semantically ambiguous: it could mean "no scratch happening" or "scratch-hold". The audio engine has no signal to pause playback while the disc is physically held . Real vinyl physics: grabbing the record freezes the disc AND the audio.

Fix: Add a dedicated onHold / onScratchStart prop that the parent uses to set playbackRate = 0 (not pause, which would reset position — set playbackRate to 0 on the AudioBufferSourceNode or via a GainNode). On onReleaseScratch, restore playbackRate to the current pitch value.

tsx
// In Waveform.tsx handlePointerDown:
onScratch?.(0);
onHoldStart?.(); // ← new prop: signals audio engine to freeze playback

// In audio engine (App.tsx / useAudio hook):
onHoldStart: () => { audioSource.playbackRate.value = 0; }
onReleaseScratch: () => { audioSource.playbackRate.value = currentPitchRate; }
Bug 3 — Waveform Drag: Audio Fights the Seek
ScrollableWaveform calls throttledSeek() every ~32ms while the audio engine is simultaneously advancing currentTime . This creates a seek-vs-play race: the waveform shows position X but audio is at X+0.032s. On mobile with GC pauses, this gap widens visually to a snap/jump.

Fix: On pointerDown in ScrollableWaveform, call onHoldStart() to freeze audio. Update dragTimeRef locally for visual feedback. On pointerUp, call onSeek(finalTime) once, then onReleaseHold(). This eliminates the race entirely.

Bug 8 (CSS) — subtle-pulse Fights the rAF Transform
Waveform.css applies animation: subtle-pulse 4s ease-in-out infinite to .vinyl-disc when playing . This CSS animation writes box-shadow to the element. Meanwhile, discRef.current.style.transform = rotate(Xdeg) is written at 60fps by the rAF loop. Two systems writing to the same element in the same frame = compositor conflict = blink.

Fix: Remove the CSS animation entirely. Move the glow to the ::before ring on .vinyl-container which is a separate element from the rotating disc. Use will-change: transform only on .vinyl-disc.

Bug 4 — Unconditional 60fps Canvas Loop
ScrollableWaveform runs requestAnimationFrame in a useEffect([draw]) with no condition . Both deck instances run at 60fps even when paused, idle, or off-screen. On a 2× DPI phone, draw() calls ctx.createLinearGradient() ~260 times per frame inside the bar loop — 31,200 gradient object allocations per second per deck.

🗺️ Full Fix Roadmap
Phase 1 — Fix the rAF Architecture (Day 1)
Target: eliminate all blinking

Waveform.tsx — Move rAF loop to a single useEffect([], []). Use useRef mirrors for isPlaying and isTouching:

Remove useEffect([isPlaying]) pattern

Remove else { lastTimeRef.current = performance.now() } branch — always update lastTimeRef inside the loop

Use isPlayingRef synchronized via a shallow useEffect([isPlaying]) that only writes to the ref

Waveform.css — Remove subtle-pulse CSS animation from .vinyl-disc:

css
/_ DELETE this block entirely _/
.vinyl-container.is-playing .vinyl-disc {
animation: subtle-pulse 4s ease-in-out infinite;
}
Add glow effect to ::before ring instead (already a separate element):

css
.vinyl-container.is-playing::before {
box-shadow: 0 0 30px var(--deck-color), inset 0 0 15px rgba(0,0,0,0.5);
opacity: 1;
transition: box-shadow 0.5s ease;
}
Waveform.css — Remove transition from .progress-ring-fill:

css
/_ Remove: transition: stroke-dasharray 0.1s ease-out; _/
.progress-ring-fill {
fill: none;
stroke: var(--deck-color, #ff0080);
stroke-width: 5;
stroke-linecap: round;
/_ no transition — updated by React render at native speed _/
}
Phase 2 — Fix the Hold/Scratch Audio Contract (Day 1–2)
Target: hold vinyl = freeze audio

Add new props to Waveform.tsx:

tsx
interface WaveformProps {
onScratchStart?: () => void; // called on pointerDown — freeze audio
onScratchEnd?: () => void; // called on pointerUp — resume audio at pitch
// keep existing onScratch(velocity) for playback rate modulation during drag
}
Waveform.tsx handlePointerDown — Replace onScratch(0) with onScratchStart?.():

tsx
const handlePointerDown = useCallback((e) => {
// ...existing rect/angle setup...
isTouchingRef.current = true;
containerRef.current!.classList.add('scratching'); // ← no setState
onScratchStart?.(); // ← tells audio engine: freeze playback NOW
}, [onScratchStart]);
Waveform.tsx handlePointerUp — Replace setIsScratching(false) with ref + className:

tsx
const handlePointerUp = useCallback((e) => {
isTouchingRef.current = false;
containerRef.current!.classList.remove('scratching');
onScratchEnd?.(); // ← tells audio engine: resume playback
}, [onScratchEnd]);
Same pattern in ScrollableWaveform.tsx — add onScratchStart / onScratchEnd to handlePointerDown / handlePointerUp

Deck.tsx — Wire the new props down from the audio engine:

tsx
<Waveform
onScratchStart={() => audioEngine.setPlaybackRate(0)}
onScratchEnd={() => audioEngine.setPlaybackRate(currentPitchRate)}
onScratch={(v) => audioEngine.setPlaybackRate(v)} // scratch velocity
/>
Fix useState(isScratching) → useRef + DOM class in Waveform.tsx:

Delete const [isScratching, setIsScratching] = React.useState(false)

In handlePointerDown: containerRef.current.classList.add('scratching')

In handlePointerUp: containerRef.current.classList.remove('scratching')

This eliminates the React re-render on every touch event

Phase 3 — Fix Waveform Drag Race Condition (Day 2)
Target: no seek fighting, no snapping

ScrollableWaveform.tsx handlePointerDown — freeze audio, use local time reference:

tsx
const handlePointerDown = useCallback((e) => {
onScratchStart?.(); // NEW — freeze audio
dragTimeRef.current = currentTimeRef.current; // snapshot
// ...rest unchanged
}, [onScratchStart]);
ScrollableWaveform.tsx handlePointerUp — single final seek, then resume:

tsx
const handlePointerUp = useCallback((e) => {
draggingRef.current.isDragging = false;
if (dragTimeRef.current !== null) {
onSeek(dragTimeRef.current); // ONE seek at end
}
onScratchEnd?.(); // resume audio at correct position
// ...momentum animation unchanged
}, [onSeek, onScratchEnd]);
ScrollableWaveform.tsx — Remove throttle from seek calls during drag:

During drag: update dragTimeRef for visual only — no onSeek calls mid-drag

On pointerUp: call onSeek once with final position

This eliminates the audio/visual race entirely

Phase 4 — Performance: Kill CPU Waste (Day 2–3)
Target: ≤15% CPU on mobile, 30fps acceptable on slow devices

ScrollableWaveform.tsx — Throttle rAF to 30fps on mobile:

tsx
const TARGET_FPS = window.innerWidth < 768 ? 30 : 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastDrawTime = 0;
const loop = (now: number) => {
if (now - lastDrawTime >= FRAME_INTERVAL) {
draw();
lastDrawTime = now;
}
frameId = requestAnimationFrame(loop);
};
ScrollableWaveform.tsx — Stop rAF loop when paused and not dragging:

tsx
// Add isPlaying prop to ScrollableWaveform
const shouldAnimate = isPlaying || isDragging;
useEffect(() => {
if (!shouldAnimate) return; // no loop when idle
let frameId: number;
const loop = (now: number) => { draw(); frameId = rAF(loop); };
frameId = rAF(loop);
return () => cancelAnimationFrame(frameId);
}, [draw, shouldAnimate]);
// When paused: draw ONCE on currentTime change, then stop
ScrollableWaveform.tsx — Pre-compute waveform gradients:

tsx
// Outside draw(), compute once when color changes:
const cachedGradientRef = useRef<{top: CanvasGradient, bottom: CanvasGradient} | null>(null);
useEffect(() => {
if (!canvasRef.current) return;
const ctx = canvasRef.current.getContext('2d')!;
const h = height;
const topGrad = ctx.createLinearGradient(0, 0, 0, h/2);
topGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
topGrad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`);
cachedGradientRef.current = { top: topGrad, bottom: mirrorGrad };
}, [color, height]);
// In draw(): use cachedGradientRef.current.top — 0 allocations per frame
ScrollableWaveform.tsx — Stop creating new AudioContext per track:

Lift the AudioContext to the parent (App-level singleton)

Pass audioBuffer as a prop from where the track is decoded

ScrollableWaveform receives pre-decoded AudioBuffer — zero fetch, zero context creation

Waveform.tsx — Reduce groove DOM nodes:

Replace 6 <div class="vinyl-groove groove-N"> DOM elements with a single <canvas> drawn once on mount

Grooves are static — they never change — so a canvas drawn once costs 0 repaints

Phase 5 — Real Physics: Scratch Deceleration (Day 3)
Target: holding and releasing feels like real vinyl

Implement scratch inertia in Waveform.tsx:

tsx
// On pointer up, apply deceleration matching vinyl physics:
// Real 33RPM vinyl: ~1.5s to stop from full speed
const VINYL_DECELERATION = 0.88; // per-frame multiplier
let scratchVelocity = lastAngularVelocityRef.current;
const decelerate = () => {
scratchVelocity _= VINYL_DECELERATION;
rotationRef.current += scratchVelocity _ dt;
if (Math.abs(scratchVelocity) < 0.5) {
onScratchEnd?.(); // resume normal playback once stopped
return;
}
requestAnimationFrame(decelerate);
};
requestAnimationFrame(decelerate);
Add playbackRate ramping in the audio engine on scratch release:

Don't snap from rate=0 to rate=1.0 — use AudioParam.linearRampToValueAtTime(1.0, context.currentTime + 0.3) for smooth speed-up

This simulates the vinyl "catching up" sound

Phase 6 — Mobile/Tablet Optimization (Day 3–4)
Target: smooth on iPhone SE, iPad, mid-range Android

Detect device capability and degrade gracefully:

tsx
const isMobile = window.innerWidth < 768;
const isLowEnd = navigator.hardwareConcurrency <= 4;
// Pass as context — reduce peaks resolution and canvas DPR
const dpr = isLowEnd ? 1 : Math.min(window.devicePixelRatio, 2);
Reduce waveform peak resolution on mobile:

Mobile: pixelsPerSecond = 60 (default is 100) → 40% fewer bars to draw

Use samplesPerPixel step of 20 instead of 10 in peak generation → 2× faster analysis

Use OffscreenCanvas for peak generation (where supported):

tsx
const worker = new Worker('./waveformWorker.ts');
worker.postMessage({ audioBuffer: buffer.getChannelData(0) });
worker.onmessage = ({ data }) => setWaveformData(data);
This moves heavy peak computation off the main thread entirely — no UI jank during analysis.

Add content-visibility: auto to non-visible deck sections in CSS to skip paint for off-screen elements

Phase 7 — Validation (Day 4)
Test hold → audio freezes → release → smooth ramp-up on Safari iOS (strictest Web Audio)

Test drag waveform → no snapping → seek lands correctly

Profile with Chrome DevTools Performance tab — confirm rAF loop drops to 0% when paused

Test on simulated throttled CPU (4× slowdown in DevTools) — waveform should remain at 30fps smooth

Fix Priority Matrix
Priority Fix Files Effort
🚨 P0 Single persistent rAF loop Waveform.tsx 1h
🚨 P0 Remove subtle-pulse CSS animation Waveform.css 10min
🚨 P0 onScratchStart freezes audio Waveform.tsx + audio engine 2h
🚨 P0 Fix waveform drag race ScrollableWaveform.tsx 1h
🔴 P1 Remove useState(isScratching) → ref+class Waveform.tsx 30min
🔴 P1 Stop unconditional 60fps rAF ScrollableWaveform.tsx 1h
🟡 P2 Pre-compute gradients ScrollableWaveform.tsx 1h
🟡 P2 Lift AudioContext to singleton App.tsx + ScrollableWaveform 2h
🟡 P3 Scratch deceleration physics Waveform.tsx 2h
🟡 P3 OffscreenCanvas worker new waveformWorker.ts 3h
