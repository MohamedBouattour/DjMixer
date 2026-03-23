import React, { useRef, useCallback, useEffect, memo } from 'react';
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
    const onChangeRef = useRef(onChange);
    const minRef = useRef(min);
    const maxRef = useRef(max);
    const pointerIdRef = useRef<number | null>(null);

    // Keep refs in sync without re-attaching listeners
    onChangeRef.current = onChange;
    minRef.current = min;
    maxRef.current = max;

    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    const calculateValue = useCallback((clientY: number) => {
        if (!rectRef.current) return;

        const rect = rectRef.current;
        const relativeY = rect.bottom - clientY;
        const clampedY = Math.max(0, Math.min(relativeY, rect.height));
        const newPercentage = clampedY / rect.height;
        const newValue = minRef.current + (newPercentage * (maxRef.current - minRef.current));

        onChangeRef.current(newValue);
    }, []);

    // Global pointer move/up handlers attached to document for reliable mobile touch tracking
    useEffect(() => {
        const handleGlobalPointerMove = (e: PointerEvent) => {
            if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
            e.preventDefault();
            calculateValue(e.clientY);
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
        if (!trackRef.current) return;

        e.preventDefault();
        e.stopPropagation();

        // Cache the rect once at the start of the drag
        rectRef.current = trackRef.current.getBoundingClientRect();
        isDragging.current = true;
        pointerIdRef.current = e.pointerId;

        // Capture pointer so we keep receiving events even if finger moves off element
        try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            // Some browsers may not support pointer capture
        }

        calculateValue(e.clientY);

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
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
