# Real Scratch Effect Implementation Plan

## Overview

We will implement a realistic vinyl scratch effect by adding physics-based momentum and inertia to the `Waveform` component. This will allow the vinyl to continue spinning after being released, simulating the physical behavior of a turntable.

## Step-by-Step Implementation

### 1. State Management for Physics

- [x] Add `velocity` ref to track the current angular velocity of the record.
- [x] Add `friction` constant to control how quickly the record slows down after a scratch.
- [x] Add `lastTimestamp` ref to calculate accurate velocity during drag interactions.

### 2. Enhanced Drag Interaction (Scratching)

- [x] In `handlePointerMove`:
  - Calculate the instantaneous velocity: `(currentAngle - lastAngle) / deltaTime`.
  - Update the `velocity` ref.
  - Continue to update the audio position (`onSeek`) and visual rotation.

### 3. Physics Simulation Loop

- [x] Create a `physicsLoop` function using `requestAnimationFrame`.
- [x] Depending on the state (Playing, Paused, Scratching):
  - **Dragging**: Velocity is determined by user input.
  - **Released (Momentum)**: If released with high velocity, apply friction to decay the velocity over time until it stops or returns to normal playback speed.
  - **Normal Playback**: Velocity moves towards the standard 33.33 RPM speed.

### 4. Release Behavior (Inertia)

- [x] In `handlePointerUp`:
  - Check the final `velocity`.
  - If expected velocity is high (scratch release), enter a "momentum" phase.
  - In the momentum phase, the `physicsLoop` will continually add the current velocity to the playback position (`currentTime`) and apply friction to reduce the velocity.
  - Once velocity drops below a certain threshold:
    - If the track was playing, smoothly transition back to normal playback speed.
    - If the track was paused, stop the rotation.

### 5. Audio Playback Rate Integration (Optional/Advanced)

- [x] For a true scratch sound, we would need to modulate the playback rate of the audio engine based on the vinyl's velocity.
- [x] _Note: This is now implemented by passing velocity from UI to AudioWorklet._

### 6. Visual Polish

- [x] Ensure the vinyl rotation visually matches the physics calculations exactly.
- [x] Fine-tune friction and mass constants to feel "heavy" like a real record.

## Mobile Audio Fixes

- [x] Fixed `isMobile` detection threshold in App.tsx (was 3000px).
- [x] Improved `AudioWorklet` loading logic to use robust absolute paths via `BASE_URL`.
- [x] Added more descriptive logging for `AudioContext` states and worklet loading to diagnose mobile issues.
- [x] Verified `AudioContext` resume logic on user gestures.
- [x] Added "Unlock Audio" overlay for robust cross-platform initialization.
- [x] Implemented sub-audible "Keep-Alive" oscillator to prevent OS-level audio suspension.
- [x] Added visibility change listeners to auto-resume audio when returning to the tab.
- [x] Added HTML5 Audio playback to unlockAudio to force iOS Audio Session Category to Playback (fix for silent switch issue).
