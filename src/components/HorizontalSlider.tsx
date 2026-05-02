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
    height = 12,
    thumbWidth = 44,
    className = '',
    showCenterLine = false
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const updateValue = useCallback((clientX: number) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newValue = min + percentage * (max - min);
        onChange(newValue);
    }, [min, max, onChange]);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        isDragging.current = true;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        updateValue(clientX);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging.current) return;
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            updateValue(clientX);
        };

        const handleMouseUp = () => {
            isDragging.current = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleMouseMove);
        window.addEventListener('touchend', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [updateValue]);

    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className={cn("flex flex-col gap-2 w-full", className)}>
            {(label || showValue) && (
                <div className="flex justify-between items-center mb-1">
                    {label && <span className="text-sm font-bold text-text-hint uppercase tracking-widest">{label}</span>}
                    {showValue && <span className="text-sm font-bold">{Math.round(value)}</span>}
                </div>
            )}
            <div 
                ref={trackRef}
                className="relative w-full bg-bg-darkest rounded-md cursor-pointer shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)] overflow-visible"
                style={{ height: `${height}px` }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
            >
                <div className="absolute inset-0 rounded-md bg-white/5"></div>
                <div 
                    className="absolute h-full left-0 rounded-md transition-all duration-75"
                    style={{ 
                        width: `${percentage}%`,
                        background: color,
                        boxShadow: `0 0 10px ${color}`
                    }}
                ></div>
                {showCenterLine && <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/20 -translate-x-1/2"></div>}
                <div 
                    className="absolute top-1/2 h-[130%] -translate-y-1/2 bg-gradient-to-b from-white via-[#e0e0e0] to-[#c8c8c8] rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.5)] cursor-grab active:cursor-grabbing z-[5]"
                    style={{ 
                        left: `calc(${percentage}% - ${thumbWidth / 2}px)`,
                        width: `${thumbWidth}px`
                    }}
                ></div>
            </div>
        </div>
    );
};

export default HorizontalSlider;
