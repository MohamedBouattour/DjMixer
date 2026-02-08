import React, { useRef, useEffect } from 'react';
import './Waveform.css';

interface WaveformProps {
    audioUrl: string | null;
    currentTime: number;
    duration?: number;
    isPlaying: boolean;
    color: string;
    bpm?: number; // adding bpm since it was passed in Deck.tsx but missing here? No, Deck.tsx passes bpm={track?.bpm} but it wasn't in WaveformProps before? Let's check Deck.tsx usage.
    // Wait, recent Deck.tsx pass had bpm={track?.bpm} but WaveformProps here didn't show it. Let me just stick to what was there minus unused.
}

const WaveformComponent: React.FC<WaveformProps> = ({
    audioUrl,
    currentTime,
    duration = 300,
    isPlaying,
    color
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const discRef = useRef<HTMLDivElement>(null);
    const rotationRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animationRef = useRef<number | null>(null);

    // Animate the disc rotation
    useEffect(() => {
        const animate = () => {
            if (isPlaying && discRef.current) {
                const now = performance.now();
                const deltaTime = now - lastTimeRef.current;
                // Standard vinyl: 33.33 RPM = ~200 degrees per second
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

    // Calculate progress arc
    const progress = duration > 0 ? (currentTime / duration) * 360 : 0;

    return (
        <div
            className={`vinyl-container ${isPlaying ? 'playing' : ''}`}
            ref={containerRef}
            style={{ '--deck-color': color } as React.CSSProperties}
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
