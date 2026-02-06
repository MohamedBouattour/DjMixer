import React, { useRef, useEffect, useCallback } from 'react';
import './Waveform.css';

interface WaveformProps {
    audioUrl: string | null;
    currentTime: number;
    duration?: number;
    onSeek: (time: number) => void;
    isPlaying: boolean;
    color: string;
}

const WaveformComponent: React.FC<WaveformProps> = ({
    audioUrl,
    currentTime,
    duration = 300,
    onSeek,
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

    // Animate the disc rotation
    useEffect(() => {
        const animate = () => {
            if (isPlaying && discRef.current && !isDraggingRef.current) {
                const now = performance.now();
                const deltaTime = now - lastTimeRef.current;
                // Speed: approximately 33.33 RPM (like a vinyl record)
                const rotationSpeed = (33.33 / 60) * 360; // degrees per second
                rotationRef.current += (rotationSpeed * deltaTime) / 1000;
                discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
                lastTimeRef.current = now;
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

        lastAngleRef.current = getAngleFromEvent(e.clientX, e.clientY);
    }, [audioUrl, getAngleFromEvent]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current || !audioUrl) return;

        const currentAngle = getAngleFromEvent(e.clientX, e.clientY);
        let angleDiff = currentAngle - lastAngleRef.current;

        // Handle wrapping around from -PI to PI
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Convert angle change to time change
        // Full rotation (2*PI) = 10 seconds of seeking
        const timeChange = (angleDiff / (2 * Math.PI)) * 10;
        const newTime = Math.max(0, Math.min(duration, currentTime + timeChange));

        onSeek(newTime);
        lastAngleRef.current = currentAngle;

        // Update disc rotation visually while dragging
        if (discRef.current) {
            rotationRef.current += (angleDiff * 180) / Math.PI;
            discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }
    }, [audioUrl, currentTime, duration, getAngleFromEvent, onSeek]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Pointer capture may already be released
        }
    }, []);

    // Calculate progress arc
    const progress = duration > 0 ? (currentTime / duration) * 360 : 0;

    return (
        <div
            className={`vinyl-container ${isPlaying ? 'playing' : ''} ${isDraggingRef.current ? 'dragging' : ''}`}
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
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'center'
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
