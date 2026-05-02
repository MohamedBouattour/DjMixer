import React, { useRef, useCallback, useEffect, memo } from 'react';
import { cn } from '../utils/cn';

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
        <div 
            className={cn("flex flex-col items-center gap-1 h-full w-full touch-none", className)}
            style={{ height: `${height}px` }}
        >
            {label && (
                <span className="text-[11px] font-bold text-text-hint tracking-widest uppercase max-xl:text-[10px] landscape:text-[9px]">
                    {label}
                </span>
            )}

            <div
                className={cn(
                    "track relative flex-1 w-20 bg-clip-content px-[34px] cursor-pointer min-h-[100px] transition-all duration-200 rounded-md shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]",
                    "max-xl:min-h-[80px] max-xl:w-11 max-xl:px-4",
                    "landscape:min-h-[60px] landscape:w-10 landscape:px-[14px]",
                    "max-md:w-[52px] max-md:px-5"
                )}
                ref={trackRef}
                style={{ 
                    touchAction: 'none',
                    background: `linear-gradient(180deg, ${color} 0%, var(--color-bg-header) 50%, var(--color-bg-header) 100%)`,
                    backgroundClip: 'content-box'
                } as React.CSSProperties}
                onPointerDown={handlePointerDown}
                onDoubleClick={(e) => e.preventDefault()}
            >
                {/* Colored fill indicator */}
                <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 rounded-md pointer-events-none max-xl:w-2.5 max-md:w-3"
                    style={{
                        height: `${percentage}%`,
                        background: `linear-gradient(to bottom, ${color}, ${color}88)`
                    }}
                />

                {/* Center line */}
                <div className="absolute top-1/2 left-[18px] right-[18px] h-0.5 bg-white/30 -translate-y-1/2 pointer-events-none max-xl:left-4 max-xl:right-4 landscape:left-[14px] landscape:right-[14px] max-md:left-5 max-md:right-5" />

                {/* Thumb */}
                <div
                    className={cn(
                        "thumb absolute left-1/2 -translate-x-1/2 w-11 h-[22px] bg-gradient-to-b from-white via-[#e0e0e0] to-[#c8c8c8] rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(0,0,0,0.1)] cursor-grab active:cursor-grabbing z-10 transition-shadow duration-150",
                        "hover:shadow-[0_2px_10px_rgba(0,0,0,0.6),0_0_12px_var(--tw-shadow-color),inset_0_1px_0_rgba(255,255,255,0.9)]",
                        "max-xl:w-10 max-xl:h-5",
                        "landscape:w-9 landscape:h-[18px]",
                        "max-md:w-12 max-md:h-6",
                        "before:content-[''] before:absolute before:top-1/2 before:left-2 before:right-2 before:h-px before:bg-black/15 before:-translate-y-1/2",
                        "after:content-[''] after:absolute after:top-[calc(50%-3px)] after:left-2 after:right-2 after:h-px after:bg-black/10"
                    )}
                    style={{ 
                        bottom: `calc(${percentage}% - 11px)`,
                        '--tw-shadow-color': color 
                    } as any}
                />
            </div>

            {showValue && (
                <span 
                    className="text-xs font-bold max-xl:text-[11px] landscape:text-[10px]" 
                    style={{ color, textShadow: `0 0 6px ${color}` }}
                >
                    {valueFormatter(value)}
                </span>
            )}
        </div>
    );
});

export default VerticalSlider;
