import React from 'react';
import { formatTime } from '../utils/helpers';
import './TimeDisplay.css';

interface TimeDisplayProps {
    currentTime: number;
    totalTime: number;
    color?: string;
    compact?: boolean;
    className?: string;
}

export const TimeDisplay: React.FC<TimeDisplayProps> = ({
    currentTime,
    totalTime,
    color,
    compact = false,
    className = ''
}) => {
    // Format: MM:SS
    const mainTime = formatTime(currentTime);
    // Format: .ms (approximate, since formatTotalSeconds usually gives (MM:SS), let's extract ms part or assume we want clean MM:SS)
    // Actually the user used formatTotalSeconds(currentTime) which returns (123s) in the previous code? 
    // Let's look at previous code: 
    // formatTime(currentTime) -> "02:30"
    // formatTotalSeconds(currentTime) -> "(150s)" or simple seconds. 
    // The previous CSS had .text-xs opacity-50 for parens.

    // Let's make it look pro: 02:30.15 where 15 is ms/frames
    const milliseconds = Math.floor((currentTime % 1) * 100).toString().padStart(2, '0');

    return (
        <div
            className={`time-display-component ${compact ? 'compact' : ''} ${className}`}
            style={color ? { '--deck-color': color } as React.CSSProperties : undefined}
        >
            <div className="time-display-main">
                {mainTime}
                <span className="time-milliseconds">.{milliseconds}</span>
            </div>
            <div className="time-display-total">
                {formatTime(totalTime)}
            </div>
        </div>
    );
};
