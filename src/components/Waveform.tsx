import React, { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '../utils/cn';

interface WaveformProps {
    currentTime: number;
    duration?: number;
    isPlaying: boolean;
    color: string;
    onScratch?: (velocity: number) => void;
    onReleaseScratch?: () => void;
    onScratchStart?: () => void;
    onScratchEnd?: () => void;
    onSeek?: (time: number) => void;
}

const WaveformComponent: React.FC<WaveformProps> = ({
    currentTime,
    duration = 300,
    isPlaying,
    color,
    onScratch,
    onReleaseScratch,
    onScratchStart,
    onScratchEnd,
    onSeek
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const discRef = useRef<HTMLDivElement>(null);
    const groovesCanvasRef = useRef<HTMLCanvasElement>(null);
    const rotationRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const momentumRef = useRef<number | null>(null);

    // Refs for animation loop to avoid dependency re-runs
    const isPlayingRef = useRef(isPlaying);
    const isTouchingRef = useRef(false);
    const [isScratching, setIsScratching] = useState(false);
    const lastAngularVelocityRef = useRef(0);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Scratch state tracking
    const lastAngleRef = useRef(0);
    const lastTouchTimeRef = useRef(0);
    const centerRef = useRef({ x: 0, y: 0 });

    // ✅ Bug 1 Fix: Single persistent animation loop
    useEffect(() => {
        const animate = (now: number) => {
            if (isPlayingRef.current && !isTouchingRef.current && discRef.current && !momentumRef.current) {
                const delta = now - lastTimeRef.current;
                const rotationSpeed = (33.33 / 60) * 360;
                rotationRef.current += (rotationSpeed * delta) / 1000;
                discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
            }
            lastTimeRef.current = now;
            animationRef.current = requestAnimationFrame(animate);
        };

        lastTimeRef.current = performance.now();
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
        };
    }, []);

    // Draw grooves once
    useEffect(() => {
        if (!groovesCanvasRef.current) return;
        const canvas = groovesCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = 400;
        canvas.width = size;
        canvas.height = size;
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;
        const center = size / 2;
        [0.15, 0.22, 0.29, 0.36, 0.43, 0.50].forEach(percent => {
            const radius = (size * (1 - percent * 2)) / 2;
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.stroke();
        });
    }, []);

    const getAngle = useCallback((clientX: number, clientY: number) => {
        const center = centerRef.current;
        return Math.atan2(clientY - center.y, clientX - center.x) * (180 / Math.PI);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!containerRef.current) return;
        if (momentumRef.current) {
            cancelAnimationFrame(momentumRef.current);
            momentumRef.current = null;
        }

        const rect = containerRef.current.getBoundingClientRect();
        centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        const angle = getAngle(e.clientX, e.clientY);
        lastAngleRef.current = angle;
        lastTouchTimeRef.current = performance.now();
        isTouchingRef.current = true;
        setIsScratching(true);

        onScratchStart?.();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onScratch?.(0);
    }, [getAngle, onScratch, onScratchStart]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isTouchingRef.current) return;

        const now = performance.now();
        const dt = (now - lastTouchTimeRef.current) / 1000;
        if (dt < 0.005) return; // Higher precision

        const angle = getAngle(e.clientX, e.clientY);
        let deltaAngle = angle - lastAngleRef.current;
        if (deltaAngle > 180) deltaAngle -= 360;
        if (deltaAngle < -180) deltaAngle += 360;

        if (discRef.current) {
            rotationRef.current += deltaAngle;
            discRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }

        const instantaneousAngularVelocity = deltaAngle / dt;
        // Smoother velocity tracking
        lastAngularVelocityRef.current = lastAngularVelocityRef.current * 0.2 + instantaneousAngularVelocity * 0.8;
        
        // Map to playback rate: 360 degrees in 1.8s (33 1/3 RPM) = 200 deg/s
        onScratch?.(lastAngularVelocityRef.current / 200);

        lastAngleRef.current = angle;
        lastTouchTimeRef.current = now;
    }, [getAngle, onScratch]);

    // ✅ Implement snappy release for professional feel
    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isTouchingRef.current) return;
        isTouchingRef.current = false;
        setIsScratching(false);

        try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { }

        // Clear any momentum animation
        if (momentumRef.current) {
            cancelAnimationFrame(momentumRef.current);
            momentumRef.current = null;
        }

        // Professional DJ controllers resume instantly on release
        onScratchEnd?.();
        onReleaseScratch?.();
        lastAngularVelocityRef.current = 0;

    }, [onScratchEnd, onReleaseScratch]);

    const progress = duration > 0 ? (currentTime / duration) * 360 : 0;

    return (
        <div
            className={cn(
                "relative w-full aspect-square max-w-[320px] max-h-[320px] mx-auto cursor-grab select-none touch-none",
                "active:cursor-grabbing",
                isScratching && "cursor-grabbing",
                "max-xl:max-w-[180px] max-xl:max-h-[180px] max-xl:w-[180px] max-xl:h-[180px]",
                "before:content-[''] before:absolute before:inset-[4%] before:rounded-full before:border-[3px] before:border-[var(--deck-color)] before:pointer-events-none before:opacity-30 before:transition-all before:duration-500",
                isPlaying && "before:shadow-[0_0_30px_var(--deck-color),inset_0_0_15px_rgba(0,0,0,0.5)] before:opacity-100"
            )}
            ref={containerRef}
            style={{ '--deck-color': color, touchAction: 'none' } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div 
                className="absolute inset-[8%] rounded-full shadow-[0_4px_30px_rgba(0,0,0,0.8),inset_0_0_50px_rgba(0,0,0,0.9)] will-change-transform" 
                ref={discRef}
                style={{
                    background: 'radial-gradient(circle at center, #0a0a0a 0%, #1a1a1a 20%, #0f0f0f 40%, #1a1a1a 60%, #0d0d0d 87%, #151515 100%)'
                }}
            >
                <canvas 
                    ref={groovesCanvasRef} 
                    className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
                />
                <div 
                    className="absolute top-[10%] left-1/2 w-1 h-[12%] rounded-[2px] -translate-x-1/2 shadow-[0_0_8px_var(--deck-color)] pointer-events-none opacity-90"
                    style={{ background: color }}
                ></div>
                <div 
                    className="absolute inset-[38%] rounded-full flex flex-col items-center justify-center text-white font-bold text-xs text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.4),0_2px_10px_rgba(0,0,0,0.3)] pointer-events-none"
                    style={{ background: color }}
                >
                    <div className="leading-tight">DJ PRO</div>
                    <div className="absolute w-[12%] h-[12%] rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_1px_2px_rgba(255,255,255,0.1)]" style={{ background: 'radial-gradient(circle, #3a3a3a 0%, #1a1a1a 60%, #0a0a0a 100%)' }}></div>
                </div>
                <div className="absolute inset-0 rounded-full bg-[linear-gradient(120deg,transparent_35%,rgba(255,255,255,0.04)_45%,rgba(255,255,255,0.07)_50%,rgba(255,255,255,0.04)_55%,transparent_65%)] pointer-events-none"></div>
            </div>
            <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90" viewBox="0 0 100 100">
                <circle className="fill-none stroke-white/8 stroke-[4]" cx="50" cy="50" r="48" />
                <circle
                    className="fill-none stroke-[5] stroke-linecap-round"
                    cx="50"
                    cy="50"
                    r="48"
                    style={{ stroke: color, strokeDasharray: `${(progress / 360) * 301.59} 301.59` }}
                />
            </svg>
        </div>
    );
};

export const Waveform = React.memo(WaveformComponent);
