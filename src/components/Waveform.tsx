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
    currentTime,
    duration = 0,
    isPlaying,
    color,
    onScratch,
    onReleaseScratch,
    onSeek
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const discRef = useRef<HTMLDivElement>(null);
    const rotationRef = useRef<number>(0);
    const isDragging = useRef<boolean>(false);
    const lastAngle = useRef<number>(0);
    const lastTime = useRef<number>(0);
    const velocity = useRef<number>(0);

    const getAngle = (clientX: number, clientY: number) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return Math.atan2(clientY - centerY, clientX - centerX);
    };

    const handleStart = (clientX: number, clientY: number) => {
        isDragging.current = true;
        lastAngle.current = getAngle(clientX, clientY);
        lastTime.current = performance.now();
        velocity.current = 0;
    };

    const handleMove = useCallback((clientX: number, clientY: number) => {
        if (!isDragging.current) return;

        const currentAngle = getAngle(clientX, clientY);
        const currentTimeNow = performance.now();
        const deltaTime = currentTimeNow - lastTime.current;

        let deltaAngle = currentAngle - lastAngle.current;
        // Handle wrap-around
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

        rotationRef.current += (deltaAngle * 180) / Math.PI;
        if (discRef.current) {
            discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }

        // Calculate velocity for scratching
        if (deltaTime > 0) {
            const currentVelocity = deltaAngle / (deltaTime / 1000); // radians per second
            velocity.current = currentVelocity;
            onScratch?.(currentVelocity);
        }

        lastAngle.current = currentAngle;
        lastTime.current = currentTimeNow;
    }, [onScratch]);

    const handleEnd = useCallback(() => {
        if (!isDragging.current) return;
        isDragging.current = false;
        onReleaseScratch?.();
    }, [onReleaseScratch]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
        const handleMouseUp = () => handleEnd();
        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches[0]) {
                handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        };
        const handleTouchEnd = () => handleEnd();

        if (isDragging.current) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleMove, handleEnd]);

    // Constant rotation when playing
    useEffect(() => {
        let animationFrame: number;
        let lastTimestamp: number;

        const animate = (timestamp: number) => {
            if (!lastTimestamp) lastTimestamp = timestamp;
            const dt = timestamp - lastTimestamp;
            lastTimestamp = timestamp;

            if (isPlaying && !isDragging.current) {
                // 33.3 RPM = 33.3 * 360 / 60 degrees per second = 199.8 deg/s
                rotationRef.current += (199.8 * dt) / 1000;
                if (discRef.current) {
                    discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
                }
            }
            animationFrame = requestAnimationFrame(animate);
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [isPlaying]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const dashArray = 283; // 2 * PI * 45 (approx)
    const dashOffset = dashArray - (dashArray * progress) / 100;

    return (
        <div
            ref={containerRef}
            className={`waveform-vinyl-container ${isPlaying ? 'is-playing' : ''} ${isDragging.current ? 'scratching' : ''}`}
            onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
            onTouchStart={(e) => {
                if (e.touches[0]) {
                    handleStart(e.touches[0].clientX, e.touches[0].clientY);
                }
            }}
            onClick={() => {
                // Simple seek on click if not dragging
                if (!isDragging.current && onSeek && containerRef.current) {
                    // Logic for seeking based on click position could go here
                }
            }}
        >
            {/* Outer progress ring */}
            <svg className="waveform-progress-ring" viewBox="0 0 100 100">
                <circle
                    className="waveform-progress-ring-bg"
                    cx="50"
                    cy="50"
                    r="48"
                />
                <circle
                    className="waveform-progress-ring-fill"
                    cx="50"
                    cy="50"
                    r="48"
                    style={{
                        strokeDasharray: `${dashArray}`,
                        strokeDashoffset: `${dashOffset}`,
                        stroke: color
                    }}
                />
            </svg>

            <div ref={discRef} className="waveform-vinyl-disc">
                {/* Visual grooves */}
                <div className="waveform-vinyl-groove waveform-groove-1"></div>
                <div className="waveform-vinyl-groove waveform-groove-2"></div>
                <div className="waveform-vinyl-groove waveform-groove-3"></div>
                <div className="waveform-vinyl-groove waveform-groove-4"></div>
                <div className="waveform-vinyl-groove waveform-groove-5"></div>
                <div className="waveform-vinyl-groove waveform-groove-6"></div>

                {/* Reflection effect */}
                <div className="waveform-vinyl-reflection"></div>

                {/* Position marker */}
                <div className="waveform-vinyl-position-marker"></div>

                {/* Center label */}
                <div className="waveform-vinyl-label" style={{ background: color }}>
                    <div className="waveform-vinyl-label-text">DJ PRO</div>
                    <div className="waveform-label-spindle"></div>
                </div>
            </div>
        </div>
    );
};

export const Waveform = React.memo(WaveformComponent);
