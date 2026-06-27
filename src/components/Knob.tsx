import React, { useRef, useEffect, useCallback, memo } from 'react';
import { cn } from '../utils/cn';

interface KnobProps {
    value: number; // 0 to 100
    min?: number;
    max?: number;
    defaultValue?: number;
    onChange: (value: number) => void;
    label?: string;
    color?: string; // Active glow color
    size?: number; // Diameter in pixels
    className?: string;
    bypassed?: boolean; // If true, rendering is greyed out
}

const Knob: React.FC<KnobProps> = memo(({
    value,
    min = 0,
    max = 100,
    defaultValue = 50,
    onChange,
    label,
    color = '#ff0080',
    size = 36,
    className = '',
    bypassed = false,
}) => {
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startValue = useRef(0);
    const pointerIdRef = useRef<number | null>(null);

    const onChangeRef = useRef(onChange);
    const valueRef = useRef(value);
    onChangeRef.current = onChange;
    valueRef.current = value;

    // Convert value to rotation angle (sweep from -135deg to +135deg)
    const getAngle = (val: number) => {
        const pct = (val - min) / (max - min);
        return -135 + pct * 270;
    };

    const currentAngle = getAngle(value);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        isDragging.current = true;
        startY.current = e.clientY;
        startValue.current = valueRef.current;
        pointerIdRef.current = e.pointerId;

        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Support browsers without pointer capture
        }

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
        e.preventDefault();

        // Drag 150px vertically to go from min to max
        const sensitivity = 150; 
        const deltaY = startY.current - e.clientY; // Upwards is positive
        const deltaValue = (deltaY / sensitivity) * (max - min);
        const newValue = Math.max(min, Math.min(max, startValue.current + deltaValue));

        onChangeRef.current(newValue);
    }, [min, max]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (!isDragging.current || e.pointerId !== pointerIdRef.current) return;
        isDragging.current = false;
        pointerIdRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
    }, []);

    useEffect(() => {
        const handleGlobalPointerMove = (e: PointerEvent) => {
            handlePointerMove(e);
        };
        const handleGlobalPointerUp = (e: PointerEvent) => {
            handlePointerUp(e);
        };

        document.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
        document.addEventListener('pointerup', handleGlobalPointerUp);
        document.addEventListener('pointercancel', handleGlobalPointerUp);

        return () => {
            document.removeEventListener('pointermove', handleGlobalPointerMove);
            document.removeEventListener('pointerup', handleGlobalPointerUp);
            document.removeEventListener('pointercancel', handleGlobalPointerUp);
        };
    }, [handlePointerMove, handlePointerUp]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        onChange(defaultValue);
    };

    // Render tick marks (11 ticks total, 27deg apart)
    const tickCount = 11;
    const ticks = Array.from({ length: tickCount }).map((_, i) => {
        const tickAngle = -135 + i * 27;
        
        // Bipolar highlighting:
        // Center value represents 12 o'clock (0 degrees).
        // Highlight ticks between 0 (center) and the current knob angle.
        let isActive = false;
        if (!bypassed) {
            if (currentAngle >= 0) {
                isActive = tickAngle >= 0 && tickAngle <= currentAngle;
            } else {
                isActive = tickAngle <= 0 && tickAngle >= currentAngle;
            }
        }

        // Draw radial lines using polar coordinates
        const rad = ((tickAngle - 90) * Math.PI) / 180;
        const rStart = size * 0.44;
        const rEnd = size * 0.52;

        const x1 = size / 2 + rStart * Math.cos(rad);
        const y1 = size / 2 + rStart * Math.sin(rad);
        const x2 = size / 2 + rEnd * Math.cos(rad);
        const y2 = size / 2 + rEnd * Math.sin(rad);

        return (
            <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isActive ? color : 'rgba(255,255,255,0.12)'}
                strokeWidth={isActive ? 1.5 : 1.0}
                className="transition-colors duration-75"
                style={{
                    filter: isActive ? `drop-shadow(0 0 2px ${color}88)` : 'none'
                }}
            />
        );
    });

    return (
        <div className={cn("flex flex-col items-center select-none", className)}>
            {label && (
                <span className="text-[7px] font-bold text-white/30 tracking-widest uppercase mb-1 font-mono">
                    {label}
                </span>
            )}
            <div
                className="relative cursor-ns-resize touch-none active:scale-[0.98] transition-transform duration-100"
                style={{ width: `${size}px`, height: `${size}px` }}
                onPointerDown={handlePointerDown}
                onDoubleClick={handleDoubleClick}
                title="Drag up/down to adjust, double-click to center"
            >
                <svg width={size} height={size} className="overflow-visible">
                    {/* Tick Marks */}
                    <g>{ticks}</g>

                    {/* Outer Bezel (Metal ring) */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size * 0.38}
                        fill="url(#metallicBezel)"
                        stroke="rgba(0,0,0,0.4)"
                        strokeWidth="0.5"
                    />

                    {/* Inner Dial Body */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size * 0.34}
                        fill="url(#knobFace)"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth="0.5"
                    />

                    {/* Center Cap highlight (simulates 3D bevel) */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size * 0.3}
                        fill="none"
                        stroke="rgba(255,255,255,0.03)"
                        strokeWidth="1"
                    />

                    {/* Rotating Indicator Pointer */}
                    <g
                        transform={`rotate(${currentAngle} ${size / 2} ${size / 2})`}
                        className="transition-transform duration-75"
                    >
                        {/* Dot or line pointer */}
                        <line
                            x1={size / 2}
                            y1={size / 2 - size * 0.12}
                            x2={size / 2}
                            y2={size / 2 - size * 0.32}
                            stroke={bypassed ? '#666666' : color}
                            strokeWidth="2"
                            strokeLinecap="round"
                            style={{
                                filter: bypassed ? 'none' : `drop-shadow(0 0 3px ${color})`
                            }}
                        />
                    </g>
                </svg>

                {/* SVG Gradients Definition */}
                <svg className="absolute w-0 h-0 pointer-events-none">
                    <defs>
                        <radialGradient id="metallicBezel" cx="50%" cy="30%" r="50%">
                            <stop offset="0%" stopColor="#666666" />
                            <stop offset="50%" stopColor="#444444" />
                            <stop offset="100%" stopColor="#222222" />
                        </radialGradient>
                        <radialGradient id="knobFace" cx="50%" cy="30%" r="50%">
                            <stop offset="0%" stopColor="#2c2d30" />
                            <stop offset="70%" stopColor="#1a1b1d" />
                            <stop offset="100%" stopColor="#0d0e0f" />
                        </radialGradient>
                    </defs>
                </svg>
            </div>
        </div>
    );
});

Knob.displayName = 'Knob';

export default Knob;
