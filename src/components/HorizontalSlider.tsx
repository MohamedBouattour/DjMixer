import React, { useRef } from 'react';
import './HorizontalSlider.css';

interface HorizontalSliderProps {
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
    label?: string;
    showValue?: boolean;
    valueFormatter?: (value: number) => string;
    color?: string;
    height?: number; // Visual thickness of the track
    className?: string;
    thumbWidth?: number;
    showCenterLine?: boolean;
}

const HorizontalSlider: React.FC<HorizontalSliderProps> = ({
    value,
    min = 0,
    max = 100,
    onChange,
    label,
    showValue = true,
    valueFormatter = (v) => `${Math.round(v)}%`,
    color = '#00ff88',
    height = 31,
    className = '',
    thumbWidth = 47,
    showCenterLine = false,
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    const calculateValue = (clientX: number) => {
        if (!trackRef.current) return;

        const rect = trackRef.current.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const clampedX = Math.max(0, Math.min(relativeX, rect.width));
        const newPercentage = clampedX / rect.width;
        const newValue = min + (newPercentage * (max - min));

        onChange(newValue);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        calculateValue(e.clientX);
        document.body.style.userSelect = 'none';
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();
        calculateValue(e.clientX);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Pointer capture may be lost
        }
        document.body.style.userSelect = '';
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        isDragging.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Pointer capture may be lost
        }
        document.body.style.userSelect = '';
    };

    return (
        <div className={`horizontal-slider-container ${className}`}>
            {label && (
                <div className="horizontal-slider-header">
                    <span className="horizontal-slider-label">{label}</span>
                    {showValue && (
                        <span className="horizontal-slider-value" style={{ color }}>
                            {valueFormatter(value)}
                        </span>
                    )}
                </div>
            )}

            <div
                className="horizontal-slider-track"
                ref={trackRef}
                style={{
                    height: `${height}px`,
                    '--slider-color': color,
                    touchAction: 'none'
                } as React.CSSProperties}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            >
                {/* Background Track */}
                <div className="track-bg" />

                {/* Fill Indicator (Left side) */}
                <div
                    className="track-fill"
                    style={{
                        width: `${percentage}%`,
                        background: `linear-gradient(to right, ${color}44, ${color}88)`
                    }}
                />

                {/* Center Line (Optional) */}
                {showCenterLine && <div className="center-line" />}

                {/* Thumb */}
                <div
                    className="slider-thumb"
                    style={{
                        left: `${percentage}%`,
                        width: `${thumbWidth}px`,
                        marginLeft: `-${thumbWidth / 2}px`
                    }}
                />
            </div>
        </div>
    );
};

export default HorizontalSlider;
