import React, { useRef, memo } from 'react';
import './VerticalSlider.css';

interface VerticalSliderProps {
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
    label?: string;
    showValue?: boolean;
    valueFormatter?: (value: number) => string;
    color?: string;
    height?: number;
    className?: string;
}

const VerticalSlider: React.FC<VerticalSliderProps> = memo(({
    value,
    min = 0,
    max = 100,
    onChange,
    label,
    showValue = true,
    valueFormatter = (v: number) => `${Math.round(v)}%`,
    color = '#00ff88',
    height = 156,
    className = '',
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const rectRef = useRef<DOMRect | null>(null);

    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    const calculateValue = (clientY: number) => {
        if (!rectRef.current) return;

        const rect = rectRef.current;
        // Calculate height from bottom, since slider goes up
        const relativeY = rect.bottom - clientY;
        const clampedY = Math.max(0, Math.min(relativeY, rect.height));
        const newPercentage = clampedY / rect.height;
        const newValue = min + (newPercentage * (max - min));

        onChange(newValue);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!trackRef.current) return;

        e.preventDefault();
        e.stopPropagation();

        // Cache the rect
        rectRef.current = trackRef.current.getBoundingClientRect();
        isDragging.current = true;

        e.currentTarget.setPointerCapture(e.pointerId);
        calculateValue(e.clientY);

        // Prevent text selection while dragging
        document.body.style.userSelect = 'none';
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();
        calculateValue(e.clientY);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        rectRef.current = null;

        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Pointer capture may already be released
        }
        document.body.style.userSelect = '';
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        isDragging.current = false;
        rectRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Pointer capture may already be released
        }
        document.body.style.userSelect = '';
    };

    return (
        <div className={`vertical-slider ${className}`} style={{ '--slider-height': `${height}px` } as React.CSSProperties}>
            {label && (
                <span className="vertical-slider-label">{label}</span>
            )}

            <div
                className="vertical-slider-track"
                ref={trackRef}
                style={{ '--slider-color': color, touchAction: 'none' } as React.CSSProperties}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onDoubleClick={(e) => e.preventDefault()}
            >
                {/* Colored fill indicator */}
                <div
                    className="vertical-slider-fill"
                    style={{
                        height: `${percentage}%`,
                        background: `linear-gradient(to bottom, ${color}, ${color}88)`
                    }}
                />

                {/* Center line */}
                <div className="vertical-slider-line" />

                {/* White dot indicator */}
                <div
                    className="vertical-slider-thumb"
                    style={{ bottom: `calc(${percentage}% - 8px)` }}
                />
            </div>

            {showValue && (
                <span className="vertical-slider-value" style={{ color }}>
                    {valueFormatter(value)}
                </span>
            )}
        </div>
    );
});

export default VerticalSlider;
