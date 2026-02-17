import React, { useRef, useEffect, useCallback } from 'react';
import './Waveform.css';

interface WaveformProps {
    audioUrl: string | null;
    currentTime: number;
    duration?: number;
    isPlaying: boolean;
    color: string;
    onScratch?: (velocity: number) => void;
    onReleaseScratch?: () => void;
    onSeek?: (time: number) => void;
}

const WaveformComponent: React.FC<WaveformProps> = ({
    audioUrl,
    currentTime,
    duration = 300,
    isPlaying,
    color,
    onScratch,
    onReleaseScratch,
    onSeek
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const discRef = useRef<HTMLDivElement>(null);
    const rotationRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animationRef = useRef<number | null>(null);

    // Scratch state
    const isTouchingRef = useRef(false);
    const lastAngleRef = useRef(0);
    const lastTouchTimeRef = useRef(0);
    const centerRef = useRef({ x: 0, y: 0 });

    const [isScratching, setIsScratching] = React.useState(false);

    // Calculate angle from center to a point
    const getAngle = useCallback((clientX: number, clientY: number) => {
        const center = centerRef.current;
        return Math.atan2(clientY - center.y, clientX - center.x) * (180 / Math.PI);
    }, []);

    // Animate the disc rotation
    useEffect(() => {
        const animate = () => {
            if (isPlaying && discRef.current && !isTouchingRef.current) {
                const now = performance.now();
                const deltaTime = now - lastTimeRef.current;
                const rotationSpeed = (33.33 / 60) * 360;
                rotationRef.current += (rotationSpeed * deltaTime) / 1000;
                discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
                lastTimeRef.current = now;
            } else {
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
        };
    }, [isPlaying]);

    // Scratch handlers
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        centerRef.current = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };

        const angle = getAngle(e.clientX, e.clientY);
        lastAngleRef.current = angle;
        lastTouchTimeRef.current = performance.now();
        isTouchingRef.current = true;
        setIsScratching(true);

        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        if (onScratch) {
            onScratch(0);
        }
    }, [getAngle, onScratch]);

    const throttledSeek = useCallback((time: number) => {
        if (!onSeek) return;
        const now = performance.now();
        if (now - lastTouchTimeRef.current > 32) {
            onSeek(time);
        }
    }, [onSeek]);

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
        const playbackRate = angularVelocity / 200;

        if (onScratch) {
            onScratch(playbackRate);
        }

        if (onSeek && duration > 0) {
            const secondsPerDegree = (1 / (33.33 / 60)) / 360;
            const seekDelta = deltaAngle * secondsPerDegree;
            const newTime = Math.max(0, Math.min(duration, currentTime + seekDelta));
            throttledSeek(newTime);
        }

        lastAngleRef.current = angle;
        lastTouchTimeRef.current = now;
    }, [getAngle, onScratch, onSeek, duration, currentTime, throttledSeek]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isTouchingRef.current) return;
        isTouchingRef.current = false;
        setIsScratching(false);

        try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }

        if (onReleaseScratch) {
            onReleaseScratch();
        }
    }, [onReleaseScratch]);

    // Calculate progress arc
    const progress = duration > 0 ? (currentTime / duration) * 360 : 0;

    return (
        <div
            className={`vinyl-container ${isPlaying ? 'playing' : ''} ${isScratching ? 'scratching' : ''}`}
            ref={containerRef}
            style={{ '--deck-color': color, touchAction: 'none' } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div className="vinyl-disc" ref={discRef}>
                {/* Vinyl grooves */}
                <div className="vinyl-groove groove-1"></div>
                <div className="vinyl-groove groove-2"></div>
                <div className="vinyl-groove groove-3"></div>
                <div className="vinyl-groove groove-4"></div>
                <div className="vinyl-groove groove-5"></div>
                <div className="vinyl-groove groove-6"></div>

                {/* Position marker dot - helps see rotation */}
                <div className="vinyl-position-marker"></div>

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
