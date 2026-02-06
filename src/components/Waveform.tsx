import React, { useRef, useEffect, useCallback } from 'react';
import './Waveform.css';

interface WaveformProps {
    audioUrl: string | null;
    currentTime: number;
    duration?: number;
    onSeek: (time: number) => void;
    onScratch?: (velocity: number) => void;
    onReleaseScratch?: () => void;
    isPlaying: boolean;
    color: string;
}

const WaveformComponent: React.FC<WaveformProps> = ({
    audioUrl,
    currentTime,
    duration = 300,
    onSeek,
    onScratch,
    onReleaseScratch,
    isPlaying,
    color
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const discRef = useRef<HTMLDivElement>(null);
    const rotationRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const lastAngleRef = useRef(0);
    const lastDragTimeRef = useRef(0);
    const velocityRef = useRef(0);
    const inertiaFrameRef = useRef<number | null>(null);

    // Animate the disc rotation
    useEffect(() => {
        const animate = () => {
            // Only auto-rotate if playing AND NOT dragging AND NOT in inertia
            if (isPlaying && discRef.current && !isDraggingRef.current && !inertiaFrameRef.current) {
                const now = performance.now();
                const deltaTime = now - lastTimeRef.current;
                // Standard vinyl: 33.33 RPM = ~200 degrees per second
                const rotationSpeed = (33.33 / 60) * 360;
                rotationRef.current += (rotationSpeed * deltaTime) / 1000;
                discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
                lastTimeRef.current = now;
            } else if (!isPlaying && discRef.current && !isDraggingRef.current && !inertiaFrameRef.current) {
                // Keep time updated even if paused
                lastTimeRef.current = performance.now();
            }
            animationRef.current = requestAnimationFrame(animate);
        };

        lastTimeRef.current = performance.now();
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (inertiaFrameRef.current) {
                cancelAnimationFrame(inertiaFrameRef.current);
            }
        };
    }, [isPlaying]);

    const getAngleFromEvent = useCallback((clientX: number, clientY: number): number => {
        if (!containerRef.current) return 0;

        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        return Math.atan2(clientY - centerY, clientX - centerX);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!audioUrl) return;

        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);

        // Stop any running inertia
        if (inertiaFrameRef.current) {
            cancelAnimationFrame(inertiaFrameRef.current);
            inertiaFrameRef.current = null;
        }

        // Initialize velocity to 0 (stopped)
        velocityRef.current = 0;

        lastAngleRef.current = getAngleFromEvent(e.clientX, e.clientY);
        lastDragTimeRef.current = performance.now();

        // Start scratch mode with velocity 0 (hand is holding the vinyl still)
        if (onScratch) {
            onScratch(0);
        }
    }, [audioUrl, getAngleFromEvent, onScratch]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current || !audioUrl) return;

        const now = performance.now();
        const dt = now - lastDragTimeRef.current;

        // Prevent division by zero
        if (dt < 1) return;

        const currentAngle = getAngleFromEvent(e.clientX, e.clientY);
        let angleDiff = currentAngle - lastAngleRef.current;

        // Handle wrapping around from -PI to PI
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Visual Update - rotate the disc
        if (discRef.current) {
            rotationRef.current += (angleDiff * 180) / Math.PI;
            discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }

        // Calculate velocity in "Playback Rate" units
        // Standard vinyl: 33.33 RPM = 3.49 rad/s
        if (onScratch) {
            const standardSpeedRadS = (33.33 * 2 * Math.PI) / 60;
            const currentSpeedRadS = angleDiff / (dt / 1000);
            const playbackRate = currentSpeedRadS / standardSpeedRadS;

            velocityRef.current = playbackRate;
            onScratch(playbackRate);
        } else {
            // Fallback to seek (legacy behavior)
            const timeChange = (angleDiff / (2 * Math.PI)) * 10;
            const newTime = Math.max(0, Math.min(duration, currentTime + timeChange));
            onSeek(newTime);
        }

        lastAngleRef.current = currentAngle;
        lastDragTimeRef.current = now;
    }, [audioUrl, currentTime, duration, getAngleFromEvent, onSeek, onScratch]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;

        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Pointer capture may already be released
        }

        // Inertia + Friction Decay
        if (onScratch && onReleaseScratch) {
            const friction = 0.88; // Lower = heavier vinyl feel
            const stopThreshold = 0.03;

            // Target velocity: 1.0 (Normal Speed) if playing, 0 if stopped
            const targetVelocity = isPlaying ? 1.0 : 0.0;

            const decay = () => {
                // Stop if user started dragging again
                if (isDraggingRef.current) {
                    inertiaFrameRef.current = null;
                    return;
                }

                // Smoothly transition velocity towards target
                // velocity = velocity * friction + target * (1 - friction)
                velocityRef.current = velocityRef.current * friction + targetVelocity * (1 - friction);

                // Visual update during inertia
                if (discRef.current) {
                    // 1.0 rate ≈ 33.33 RPM ≈ 200 deg/s ≈ 3.3 deg/frame at 60fps
                    const degPerFrame = velocityRef.current * 3.3;
                    rotationRef.current += degPerFrame;
                    discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
                }

                // Send velocity to audio engine
                onScratch(velocityRef.current);

                // Continue until velocity is close to target
                if (Math.abs(velocityRef.current - targetVelocity) > stopThreshold) {
                    inertiaFrameRef.current = requestAnimationFrame(decay);
                } else {
                    // Fully stopped or reached target speed
                    inertiaFrameRef.current = null;
                    // If stopped, force 0
                    if (!isPlaying) velocityRef.current = 0;

                    onReleaseScratch();
                }
            };

            // Run inertia if moving OR if we need to spin up (playing)
            if (Math.abs(velocityRef.current) > stopThreshold || isPlaying) {
                decay();
            } else {
                // No velocity and target is 0 -> release immediately
                onReleaseScratch();
            }
        } else if (onReleaseScratch) {
            onReleaseScratch();
        }
    }, [onScratch, onReleaseScratch]);

    // Calculate progress arc
    const progress = duration > 0 ? (currentTime / duration) * 360 : 0;

    return (
        <div
            className={`vinyl-container ${isPlaying ? 'playing' : ''}`}
            ref={containerRef}
            style={{ '--deck-color': color, touchAction: 'none' } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <div className="vinyl-disc" ref={discRef}>
                {/* Vinyl grooves */}
                <div className="vinyl-groove groove-1"></div>
                <div className="vinyl-groove groove-2"></div>
                <div className="vinyl-groove groove-3"></div>
                <div className="vinyl-groove groove-4"></div>
                <div className="vinyl-groove groove-5"></div>
                <div className="vinyl-groove groove-6"></div>

                {/* Center label */}
                <div className="vinyl-label" style={{ background: color }}>
                    {/* Mini waveform visualization */}
                    {audioUrl && (
                        <div className={`mini-waveform ${isPlaying ? 'playing' : ''}`}>
                            <div className="wave-bar bar-1"></div>
                            <div className="wave-bar bar-2"></div>
                            <div className="wave-bar bar-3"></div>
                            <div className="wave-bar bar-4"></div>
                            <div className="wave-bar bar-5"></div>
                        </div>
                    )}
                    <div className="label-spindle"></div>
                </div>

                {/* Light reflection effect */}
                <div className="vinyl-reflection"></div>
            </div>

            {/* Progress indicator ring */}
            <svg className="progress-ring" viewBox="0 0 100 100">
                <circle
                    className="progress-ring-bg"
                    cx="50"
                    cy="50"
                    r="48"
                />
                <circle
                    className="progress-ring-fill"
                    cx="50"
                    cy="50"
                    r="48"
                    style={{
                        stroke: color,
                        strokeDasharray: `${(progress / 360) * 301.59} 301.59`,
                    }}
                />
            </svg>

            {/* Tonearm */}
            <div className={`tonearm ${isPlaying ? 'playing' : ''}`}>
                <div className="tonearm-base"></div>
                <div className="tonearm-arm"></div>
                <div className="tonearm-head"></div>
            </div>
        </div>
    );
};

export const Waveform = React.memo(WaveformComponent);
