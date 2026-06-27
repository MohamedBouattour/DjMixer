import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '../utils/cn';

interface HorizontalSliderProps {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    label?: string;
    showValue?: boolean;
    color?: string;
    height?: number;
    thumbWidth?: number;
    className?: string;
    showCenterLine?: boolean;
}

const HorizontalSlider: React.FC<HorizontalSliderProps> = ({
    value,
    min,
    max,
    onChange,
    label,
    showValue = true,
    color = '#ff0080',
    height = 20,
    thumbWidth = 48,
    className = '',
    showCenterLine = false
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const pointerIdRef = useRef<number | null>(null);

    const updateValue = useCallback((clientX: number) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newValue = min + percentage * (max - min);
        onChange(newValue);
    }, [min, max, onChange]);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
            e.preventDefault();
            updateValue(e.clientX);
        };
        const handlePointerUp = (e: PointerEvent) => {
            if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
            isDragging.current = false;
            pointerIdRef.current = null;
        };
        document.addEventListener('pointermove', handlePointerMove, { passive: false });
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerUp);
        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [updateValue]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!trackRef.current) return;
        e.preventDefault();
        isDragging.current = true;
        pointerIdRef.current = e.pointerId;
        try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
        updateValue(e.clientX);
    };

    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className={cn("flex flex-col gap-1 w-full touch-none", className)}>
            {(label || showValue) && (
                <div className="flex justify-between items-center">
                    {label && <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-display">{label}</span>}
                    {showValue && <span className="text-xs font-bold text-on-surface/70 font-mono">{Math.round(value)}</span>}
                </div>
            )}
            <div
                ref={trackRef}
                className="relative w-full rounded-[6px] cursor-pointer overflow-visible"
                style={{
                    height: `${height}px`,
                    background: `linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))`,
                    boxShadow: `inset 0 2px 6px rgba(0,0,0,0.5)`,
                    touchAction: 'none'
                }}
                onPointerDown={handlePointerDown}
            >
                <div
                    className="absolute h-full left-0 rounded-[6px] transition-all duration-75"
                    style={{
                        width: `${percentage}%`,
                        background: `linear-gradient(to right, ${color}88, ${color})`,
                        boxShadow: `0 0 8px ${color}44`
                    }}
                />
                {showCenterLine && <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/20 -translate-x-1/2" />}
                <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-[4px] cursor-grab active:cursor-grabbing z-[5] transition-shadow duration-150 border border-white/10"
                    style={{
                        left: `calc(${percentage}% - ${thumbWidth / 2}px)`,
                        width: `${thumbWidth}px`,
                        height: `${Math.max(height + 12, 28)}px`,
                        background: `linear-gradient(to bottom, #e8e8e8, #c0c0c0)`,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.6) inset, 0 0 15px ${color}44`
                    }}
                >
                    <div className="absolute top-1/2 left-3 right-3 h-px bg-black/15 -translate-y-1/2" />
                    <div className="absolute top-[calc(50%-4px)] left-3 right-3 h-px bg-black/10" />
                </div>
            </div>
        </div>
    );
};

export default HorizontalSlider;
