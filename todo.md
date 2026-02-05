# Real Scratch Effect Implementation Plan

## Overview
We will implement a realistic vinyl scratch effect by adding physics-based momentum and inertia to the `Waveform` component. This will allow the vinyl to continue spinning after being released, simulating the physical behavior of a turntable.

## Step-by-Step Implementation

### 1. State Management for Physics
- [ ] Add `velocity` ref to track the current angular velocity of the record.
- [ ] Add `friction` constant to control how quickly the record slows down after a scratch.
- [ ] Add `lastTimestamp` ref to calculate accurate velocity during drag interactions.

### 2. Enhanced Drag Interaction (Scratching)
- [ ] In `handlePointerMove`:
    - Calculate the instantaneous velocity: `(currentAngle - lastAngle) / deltaTime`.
    - Update the `velocity` ref.
    - Continue to update the audio position (`onSeek`) and visual rotation.

### 3. Physics Simulation Loop
- [ ] Create a `physicsLoop` function using `requestAnimationFrame`.
- [ ] Depending on the state (Playing, Paused, Scratching):
    - **Dragging**: Velocity is determined by user input.
    - **Released (Momentum)**: If released with high velocity, apply friction to decay the velocity over time until it stops or returns to normal playback speed.
    - **Normal Playback**: Velocity moves towards the standard 33.33 RPM speed.

### 4. Release Behavior (Inertia)
- [ ] In `handlePointerUp`:
    - Check the final `velocity`.
    - If expected velocity is high (scratch release), enter a "momentum" phase.
    - In the momentum phase, the `physicsLoop` will continually add the current velocity to the playback position (`currentTime`) and apply friction to reduce the velocity.
    - Once velocity drops below a certain threshold:
        - If the track was playing, smoothly transition back to normal playback speed.
        - If the track was paused, stop the rotation.

### 5. Audio Playback Rate Integration (Optional/Advanced)
- [ ] For a true scratch sound, we would need to modulate the playback rate of the audio engine based on the vinyl's velocity.
- [ ] *Note: This requires checking if the underlying audio player supports variable playback rates (e.g., HTML5 Audio `playbackRate`).*

### 6. Visual Polish
- [ ] Ensure the vinyl rotation visually matches the physics calculations exactly.
- [ ] Fine-tune friction and mass constants to feel "heavy" like a real record.
