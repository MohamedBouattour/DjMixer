import React from 'react';
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

const VerticalSlider: React.FC<VerticalSliderProps> = ({
    value,
    min = 0,
    max = 100,
    onChange,
    label,
    showValue = true,
    valueFormatter = (v) => `${Math.round(v)}%`,
    color = '#00ff88',
    height = 120,
    className = '',
}) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className={`vertical-slider ${className}`} style={{ '--slider-height': `${height}px` } as React.CSSProperties}>
            {label && (
                <span className="vertical-slider-label">{label}</span>
            )}

            <div className="vertical-slider-track" style={{ '--slider-color': color } as React.CSSProperties}>
                {/* Colored fill indicator */}
                <div
                    className="vertical-slider-fill"
                    style={{
                        height: `${percentage}%`,
                        background: `linear-gradient(to top, ${color}, ${color}88)`
                    }}
                />

                {/* Center line */}
                <div className="vertical-slider-line" />

                {/* The actual range input */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    onMouseUp={(e) => e.currentTarget.blur()}
                    className="vertical-slider-input"
                />

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
};

export default VerticalSlider;
