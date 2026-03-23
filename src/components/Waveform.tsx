import React, { useRef, useEffect, useCallback } from 'react';
import './Waveform.css';

interface WaveformProps {
    currentTime: number;
    duration?: number;
    isPlaying: boolean;
    color: string;
    onScratch?: (velocity: number) => void;
    onReleaseScratch?: () => void;
    onScratchStart?: () => void;
    onScratchEnd?: () => void;
    onSeek?: (time: number) => void;
}

const WaveformComponent: React.FC<WaveformProps> = ({
    currentTime,
    duration = 300,
    isPlaying,
    color,
    onScratch,
    onReleaseScratch,
    onScratchStart,
    onScratchEnd,
    onSeek
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const discRef = useRef<HTMLDivElement>(null);
    const groovesCanvasRef = useRef<HTMLCanvasElement>(null);
    const rotationRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const momentumRef = useRef<number | null>(null);

    // Refs for animation loop to avoid dependency re-runs
    const isPlayingRef = useRef(isPlaying);
    const isTouchingRef = useRef(false);
    const lastAngularVelocityRef = useRef(0);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Scratch state tracking
    const lastAngleRef = useRef(0);
    const lastTouchTimeRef = useRef(0);
    const centerRef = useRef({ x: 0, y: 0 });

    // ✅ Bug 1 Fix: Single persistent animation loop
    useEffect(() => {
        const animate = (now: number) => {
            if (isPlayingRef.current && !isTouchingRef.current && discRef.current && !momentumRef.current) {
                const delta = now - lastTimeRef.current;
                const rotationSpeed = (33.33 / 60) * 360;
                rotationRef.current += (rotationSpeed * delta) / 1000;
                discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
            }
            lastTimeRef.current = now;
            animationRef.current = requestAnimationFrame(animate);
        };

        lastTimeRef.current = performance.now();
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
        };
    }, []);

    // Draw grooves once
    useEffect(() => {
        if (!groovesCanvasRef.current) return;
        const canvas = groovesCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = 400;
        canvas.width = size;
        canvas.height = size;
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;
        const center = size / 2;
        [0.15, 0.22, 0.29, 0.36, 0.43, 0.50].forEach(percent => {
            const radius = (size * (1 - percent * 2)) / 2;
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.stroke();
        });
    }, []);

    const getAngle = useCallback((clientX: number, clientY: number) => {
        const center = centerRef.current;
        return Math.atan2(clientY - center.y, clientX - center.x) * (180 / Math.PI);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!containerRef.current) return;
        if (momentumRef.current) {
            cancelAnimationFrame(momentumRef.current);
            momentumRef.current = null;
        }

        const rect = containerRef.current.getBoundingClientRect();
        centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        const angle = getAngle(e.clientX, e.clientY);
        lastAngleRef.current = angle;
        lastTouchTimeRef.current = performance.now();
        isTouchingRef.current = true;

        containerRef.current.classList.add('scratching');
        onScratchStart?.();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onScratch?.(0);
    }, [getAngle, onScratch, onScratchStart]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isTouchingRef.current) return;

        const now = performance.now();
        const dt = (now - lastTouchTimeRef.current) / 1000;
        if (dt < 0.01) return;

        const angle = getAngle(e.clientX, e.clientY);
        let deltaAngle = angle - lastAngleRef.current;
        if (deltaAngle > 180) deltaAngle -= 360;
        if (deltaAngle < -180) deltaAngle += 360;

        if (discRef.current) {
            rotationRef.current += deltaAngle;
            discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }

        const angularVelocity = deltaAngle / dt;
        lastAngularVelocityRef.current = angularVelocity;
        onScratch?.(angularVelocity / 200);

        if (onSeek && duration > 0) {
            const secondsPerDegree = (1 / (33.33 / 60)) / 360;
            const seekDelta = deltaAngle * secondsPerDegree;
            onSeek(Math.max(0, Math.min(duration, currentTime + seekDelta)));
        }

        lastAngleRef.current = angle;
        lastTouchTimeRef.current = now;
    }, [getAngle, onScratch, onSeek, duration, currentTime]);

    // ✅ Phase 5: Implement scratch inertia / deceleration
    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isTouchingRef.current) return;
        isTouchingRef.current = false;
        containerRef.current?.classList.remove('scratching');

        try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { }

        const VINYL_DECELERATION = 0.92;
        let scratchVelocity = lastAngularVelocityRef.current;
        let lastMomentumTime = performance.now();

        const decelerate = (now: number) => {
            const dt = (now - lastMomentumTime) / 1000;
            lastMomentumTime = now;
            
            scratchVelocity *= VINYL_DECELERATION;
            rotationRef.current += scratchVelocity * dt;
            
            if (discRef.current) {
                discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
            }

            // Map velocity back to playback rate during deceleration
            onScratch?.(scratchVelocity / 200);

            if (Math.abs(scratchVelocity) > 5) {
                momentumRef.current = requestAnimationFrame(decelerate);
            } else {
                momentumRef.current = null;
                onScratchEnd?.();
                onReleaseScratch?.();
            }
        };

        if (Math.abs(scratchVelocity) > 10) {
            momentumRef.current = requestAnimationFrame(decelerate);
        } else {
            onScratchEnd?.();
            onReleaseScratch?.();
        }
    }, [onScratch, onScratchEnd, onReleaseScratch]);

    const progress = duration > 0 ? (currentTime / duration) * 360 : 0;

    return (
        <div
            className={`waveform-vinyl-container ${isPlaying ? 'is-playing' : ''}`}
            ref={containerRef}
            style={{ '--deck-color': color, touchAction: 'none' } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div className="waveform-vinyl-disc" ref={discRef}>
                <canvas 
                    ref={groovesCanvasRef} 
                    className="waveform-vinyl-grooves-canvas"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                />
                <div className="waveform-vinyl-position-marker"></div>
                <div className="waveform-vinyl-label" style={{ background: color }}>
                    <div className="waveform-vinyl-label-text">DJ PRO</div>
                    <div className="waveform-label-spindle"></div>
                </div>
                <div className="waveform-vinyl-reflection"></div>
            </div>
            <svg className="waveform-progress-ring" viewBox="0 0 100 100">
                <circle className="waveform-progress-ring-bg" cx="50" cy="50" r="48" />
                <circle
                    className="waveform-progress-ring-fill"
                    cx="50"
                    cy="50"
                    r="48"
                    style={{ stroke: color, strokeDasharray: `${(progress / 360) * 301.59} 301.59` }}
                />
            </svg>
            <div className={`waveform-tonearm ${isPlaying ? 'is-playing' : ''}`}>
                <div className="waveform-tonearm-base"></div>
                <div className="waveform-tonearm-arm"></div>
                <div className="waveform-tonearm-head"></div>
            </div>
        </div>
    );
};

export const Waveform = React.memo(WaveformComponent);
