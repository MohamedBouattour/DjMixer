import React, { useRef, useEffect, useCallback } from 'react';
import './HorizontalSlider.css';

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
        <div className={`horizontal-slider-container ${className}`}>
            {(label || showValue) && (
                <div className="horizontal-slider-header">
                    {label && <span className="horizontal-slider-label">{label}</span>}
                    {showValue && <span className="horizontal-slider-value">{Math.round(value)}</span>}
                </div>
            )}
            <div 
                ref={trackRef}
                className="horizontal-slider-track"
                style={{ height: `${height}px` }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
            >
                <div className="horizontal-track-bg"></div>
                <div 
                    className="horizontal-track-fill"
                    style={{ 
                        width: `${percentage}%`,
                        background: color,
                        boxShadow: `0 0 10px ${color}`
                    }}
                ></div>
                {showCenterLine && <div className="horizontal-center-line"></div>}
                <div 
                    className="horizontal-slider-thumb"
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
