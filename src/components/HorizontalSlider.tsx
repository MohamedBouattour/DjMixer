import React, { useRef, useCallback, useEffect } from 'react';
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
    const rectRef = useRef<DOMRect | null>(null);
    const onChangeRef = useRef(onChange);
    const minRef = useRef(min);
    const maxRef = useRef(max);
    const pointerIdRef = useRef<number | null>(null);

    // Keep refs current
    onChangeRef.current = onChange;
    minRef.current = min;
    maxRef.current = max;

    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    const calculateValue = useCallback((clientX: number) => {
        if (!rectRef.current) return;

        const rect = rectRef.current;
        const relativeX = clientX - rect.left;
        const clampedX = Math.max(0, Math.min(relativeX, rect.width));
        const newPercentage = clampedX / rect.width;
        const newValue = minRef.current + (newPercentage * (maxRef.current - minRef.current));

        onChangeRef.current(newValue);
    }, []);

    // Global pointer move/up handlers for reliable mobile touch tracking
    useEffect(() => {
        const handleGlobalPointerMove = (e: PointerEvent) => {
            if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
            e.preventDefault();
            calculateValue(e.clientX);
        };

        const handleGlobalPointerUp = (e: PointerEvent) => {
            if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
            isDragging.current = false;
            rectRef.current = null;
            pointerIdRef.current = null;
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
        };

        document.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
        document.addEventListener('pointerup', handleGlobalPointerUp);
        document.addEventListener('pointercancel', handleGlobalPointerUp);

        return () => {
            document.removeEventListener('pointermove', handleGlobalPointerMove);
            document.removeEventListener('pointerup', handleGlobalPointerUp);
            document.removeEventListener('pointercancel', handleGlobalPointerUp);
        };
    }, [calculateValue]);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!trackRef.current) return;

        // Cache rect at start of drag to avoid layout thrashing
        rectRef.current = trackRef.current.getBoundingClientRect();
        isDragging.current = true;
        pointerIdRef.current = e.pointerId;

        try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            // Some browsers may not support pointer capture
        }

        calculateValue(e.clientX);
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
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
