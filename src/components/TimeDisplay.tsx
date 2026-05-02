import React from 'react';
import { formatTime } from '../utils/helpers';
import { cn } from '../utils/cn';

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
    const milliseconds = Math.floor((currentTime % 1) * 100).toString().padStart(2, '0');

    return (
        <div
            className={cn(
                "flex flex-col items-end tabular-nums leading-none min-w-[80px]",
                className
            )}
        >
            <div className={cn(
                "font-bold text-white tracking-[0.5px] flex items-baseline justify-end",
                compact ? "text-sm" : "text-[18px] max-xl:text-[15px] landscape:text-xs"
            )}>
                {mainTime}
                <span className={cn(
                    "text-[#888] font-medium ml-[2px]",
                    compact ? "text-[10px]" : "text-xs landscape:text-[9px]"
                )}>
                    .{milliseconds}
                </span>
            </div>
            <div 
                className={cn(
                    "font-semibold mt-[2px] opacity-80",
                    compact ? "text-[9px]" : "text-[11px] landscape:text-[8px]"
                )}
                style={{ color: color || '#888' }}
            >
                {formatTime(totalTime)}
            </div>
        </div>
    );
};
