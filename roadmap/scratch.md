# Scratching Effects & Heavy Audio Processing Roadmap

## Context & Motivation
Currently, our audio engine uses `HTMLAudioElement` with `MediaElementAudioSourceNode`. While efficient for streaming, this approach has significant limitations for DJing features like scratching:
1.  **High Latency:** Seeking and changing `playbackRate` interact with the browser's buffering strategy, causing audible lag.
2.  **No Reverse Playback:** `HTMLAudioElement` generally does not support negative `playbackRate` for reverse play (essential for scratching).
3.  **Granularity:** Scratching requires sample-level access to the audio buffer for smooth, artifact-free scrubbing.

To achieve "Pro" level scratching, we must transition to a fully memory-resident `AudioBuffer` approach, likely leveraging `AudioWorklet` and potentially **WebAssembly (Wasm)** for heavy DSP (Digital Signal Processing).

## Use Cases for WebAssembly (Wasm) in Audio
WebAssembly allows us to run code at near-native speed within the browser. In the context of a DJ mixer, the heavy CPU treatments that justify Wasm include:

1.  **High-Quality Resampling:** When scratching fast, the playback speed varies wildly. Simple linear interpolation (what standard Web Audio nodes do) causes aliasing (metallic/digital artifacts). Wasm lets us implement high-quality windowed sinc interpolation (Lanczos) for "analog-like" sound.
2.  **Time-Stretching & Pitch-Shifting (Time-Scale Modification):** Changing the BPM without changing the pitch (Master Key) requires complex FFT (Fast Fourier Transform) algorithms (like Phase Vocoder or WSOLA). These are extremely CPU intensive and are best handled by C++ libraries (e.g., Rubberband, SoundTouch) compiled to Wasm.
3.  **Low-Latency Physics:** Calculating the angular momentum, friction, and resistance of the vinyl 44,100 times a second inside the audio thread ensures the "feel" is perfectly synced with the sound, eliminating the "rubber band" lag effect of the UI thread.
4.  **Complex Effects:** Convolution Reverbs, Analog Modeling filters, and dynamic limiters.

## Roadmap Steps

### Phase 1: Foundation - AudioWorklet & Buffer Architecture
Stop streaming from `<audio>` elements for the active deck.
- [ ] **Load Audio into Memory:** Modify `useDeck` to fully decode audio data (`audioContext.decodeAudioData`) into an `AudioBuffer`.
- [ ] **Create AudioWorklet:** Implement a basic custom `AudioWorkletProcessor` that plays the buffer.
- [ ] **Sample-Accurate Playback:** Pass the "playhead position" parameter to the Worklet, allowing instant jumps and scrubbing without the `seek` latency of streams.

### Phase 2: The Physics of Scratch (JS + Worklet)
Implement the logic defined in `todo.md` but move the "heavy lifting" to the audio thread.
- [ ] **SharedArrayBuffer:** Use `SharedArrayBuffer` to share the "Vinyl Velocity" and "Touch State" between the UI (React) and the Audio Thread (Worklet) instantly.
- [ ] **Physics Simulation:** In the Worklet, apply the velocity to the pointer.
    - *Formula:* `nextPosition = currentPosition + (velocity * sampleRate)`
- [ ] **Interpolation:** Implement at least Cubic Interpolation in the Worklet to smooth out the jagged edges of slow movements.

### Phase 3: WebAssembly Integration (Performance & Quality)
For the heavy CPU treatment mentioned.
- [ ] **Toolchain Setup:** Set up a Rust or AssemblyScript environment to compile to `.wasm`.
- [ ] **Wasm Loader:** Create a loader to inject the Wasm module into the `AudioWorklet` scope.
- [ ] **DSP Implementation:**
    - Move the interpolation logic to Wasm.
    - Implement a "Vari-Speed" algorithm that handles negative speeds (reverse) gracefully.
- [ ] **Optimization:** Use SIMD (Single Instruction, Multiple Data) instructions in Wasm for processing stereo channels in parallel.

### Phase 4: Time-Stretching (The "Heavy" CPU Case)
Separating Pitch from Speed during scratching.
- [ ] **Library Selection:** Evaluate `compiling SoundTouch` or `Rubberband` to Wasm.
- [ ] **Integration:** Pipe the audio through the Wasm Time-Stretcher before outputting.
- [ ] **Real-time Control:** Allow scratching to affect *time* but optionally lock the *pitch* (Key Lock), which is mathematically very expensive and necessitates Wasm.

## Technical Feasibility Note
- **Browser Compatibility:** `AudioWorklet` and `WebAssembly` are widely supported in modern browsers.
- **Memory:** Storing full songs in RAM (PCM WAV) takes ~10MB per minute. For mobile devices, we might need a hybrid approach (buffer current region + stream the rest) if tracks are long sets.

## Immediate Next Steps (Proof of Concept)
1. Write a simple `scratch-processor.js` (AudioWorklet).
2. Create a test component that loads a short sample into a buffer.
3. Control the playback speed of that buffer with a slider via the Worklet parameters.
