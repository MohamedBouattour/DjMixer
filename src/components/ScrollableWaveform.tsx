import React, { useEffect, useRef, useState, useCallback } from 'react';
import './ScrollableWaveform.css';

interface ScrollableWaveformProps {
    audioUrl: string | null;
    audioBuffer?: AudioBuffer | null;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    onScratch?: (velocity: number) => void;
    onReleaseScratch?: () => void;
    color: string;
    bpm?: number;
    height?: number;
    isLoading?: boolean;
}

interface WaveformData {
    peaks: Float32Array;
    duration: number;
}

const ScrollableWaveformComponent: React.FC<ScrollableWaveformProps> = ({
    audioUrl,
    audioBuffer,
    currentTime,
    duration,
    onSeek,
    onScratch,
    onReleaseScratch,
    color,
    bpm,
    height = 60,
    isLoading = false
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Use refs for high-frequency updates to avoid React render overhead
    const currentTimeRef = useRef(currentTime);
    const dragTimeRef = useRef<number | null>(null);
    
    // Update local ref when prop changes (if not dragging)
    useEffect(() => {
        if (!isDragging) {
            currentTimeRef.current = currentTime;
        }
    }, [currentTime, isDragging]);

    const pixelsPerSecondRef = useRef<number>(100);

    // Physics Refs for momentum
    const velocityRef = useRef(0);
    const lastTimestampRef = useRef(0);
    const lastXRef = useRef(0);
    const momentumFrameRef = useRef<number | null>(null);
    const friction = 0.95; // Slightly less friction for better coasting

    // Dragging mechanics
    const draggingRef = useRef({
        isDragging: false,
        startX: 0,
        startTime: 0,
        lastOnSeekTime: 0
    });

    const colorToRGB = useCallback((hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }, []);

    // Generate waveform peaks
    useEffect(() => {
        const generatePeaks = async () => {
            if (!audioUrl) {
                setWaveformData(null);
                return;
            }

            try {
                let buffer: AudioBuffer;
                if (audioBuffer) {
                    buffer = audioBuffer;
                } else {
                    const audioContext = new AudioContext();
                    const response = await fetch(audioUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    buffer = await audioContext.decodeAudioData(arrayBuffer);
                    audioContext.close();
                }

                const pixelsPerSecond = pixelsPerSecondRef.current;
                const totalWidthEstimated = buffer.duration * pixelsPerSecond;
                const samplesPerPixel = Math.max(1, Math.floor(buffer.length / totalWidthEstimated));

                const numPeaks = Math.ceil(buffer.length / samplesPerPixel);
                const peaks = new Float32Array(numPeaks * 2);
                const channel = buffer.getChannelData(0);

                for (let i = 0; i < numPeaks; i++) {
                    const start = i * samplesPerPixel;
                    const end = Math.min(start + samplesPerPixel, channel.length);
                    let min = 0; let max = 0;
                    for (let j = start; j < end; j += 10) {
                        const sample = channel[j];
                        if (sample < min) min = sample;
                        if (sample > max) max = sample;
                    }
                    peaks[i * 2] = min; peaks[i * 2 + 1] = max;
                }
                setWaveformData({ peaks, duration: buffer.duration });
            } catch (error) {
                console.error('Error generating waveform:', error);
            }
        };
        generatePeaks();
    }, [audioUrl, audioBuffer]);

    // Drawing Logic
    const draw = useCallback(() => {
        if (!canvasRef.current || !containerRef.current || !waveformData) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const viewTime = dragTimeRef.current !== null ? dragTimeRef.current : currentTimeRef.current;

        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;

        const targetWidth = Math.floor(containerWidth * dpr);
        const targetHeight = Math.floor(height * dpr);

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            canvas.style.width = `${containerWidth}px`;
            canvas.style.height = `${height}px`;
        }

        ctx.resetTransform();
        ctx.scale(dpr, dpr);

        // Clear
        const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#0d0d0d');
        bgGradient.addColorStop(0.5, '#151515');
        bgGradient.addColorStop(1, '#0d0d0d');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, containerWidth, height);

        const pixelsPerSecond = pixelsPerSecondRef.current;
        const peaks = waveformData.peaks;
        const samplesPerSecondVisual = (peaks.length / 2) / waveformData.duration;
        const rgb = colorToRGB(color);

        const halfWindowSeconds = (containerWidth / pixelsPerSecond) / 2;
        const startTime = viewTime - halfWindowSeconds;
        const endTime = viewTime + halfWindowSeconds;
        const centerY = height / 2;
        const centerX = containerWidth / 2;

        // Beat Grid
        if (bpm && bpm > 0) {
            const secondsPerBeat = 60 / bpm;
            const firstBeatTime = Math.ceil(startTime / secondsPerBeat) * secondsPerBeat;
            ctx.beginPath();
            for (let t = firstBeatTime; t < endTime; t += secondsPerBeat) {
                const x = (t - startTime) * pixelsPerSecond;
                ctx.moveTo(x, 0); ctx.lineTo(x, height);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1; ctx.stroke();

            ctx.beginPath();
            for (let t = firstBeatTime; t < endTime; t += secondsPerBeat) {
                if (Math.round(t / secondsPerBeat) % 4 === 0) {
                    const x = (t - startTime) * pixelsPerSecond;
                    ctx.moveTo(x, 0); ctx.lineTo(x, height);
                }
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1; ctx.stroke();
        }

        // Waveform Bars
        const barWidth = 2;
        const gap = 1;
        const step = barWidth + gap;
        for (let x = 0; x < containerWidth; x += step) {
            const timeAtX = startTime + (x / pixelsPerSecond);
            if (timeAtX < 0 || timeAtX > waveformData.duration) continue;

            const peakIdx = Math.floor(timeAtX * samplesPerSecondVisual) * 2;
            if (peakIdx >= peaks.length - 1) continue;

            const min = peaks[peakIdx];
            const max = peaks[peakIdx + 1];
            const topHeight = max * centerY * 0.85;
            const bottomHeight = -min * centerY * 0.85;

            const alpha = x < centerX ? 1.0 : 0.45;
            const amp = Math.max(Math.abs(max), Math.abs(min));
            const bright = Math.min(1, amp * 1.5 + 0.3);

            if (topHeight > 0.5) {
                const g = ctx.createLinearGradient(0, centerY - topHeight, 0, centerY);
                g.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * bright})`);
                g.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
                ctx.fillStyle = g; ctx.fillRect(x, centerY - topHeight, barWidth, topHeight);
            }
            if (bottomHeight > 0.5) {
                const g = ctx.createLinearGradient(0, centerY, 0, centerY + bottomHeight);
                g.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
                g.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * bright})`);
                ctx.fillStyle = g; ctx.fillRect(x, centerY, barWidth, bottomHeight);
            }
        }

        // Playhead
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = 12;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height); ctx.stroke();
        ctx.restore();

        // Markers
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(centerX - 5, 0); ctx.lineTo(centerX + 5, 0); ctx.lineTo(centerX, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(centerX - 5, height); ctx.lineTo(centerX + 5, height); ctx.lineTo(centerX, height - 7); ctx.fill();

    }, [waveformData, color, bpm, height, colorToRGB]);

    // Animation Loop
    useEffect(() => {
        let frameId: number;
        const loop = () => {
            draw();
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [draw]);

    const throttledSeek = useCallback((time: number) => {
        const now = performance.now();
        if (now - draggingRef.current.lastOnSeekTime > 32) { // ~30fps throttle for global seek
            onSeek(time);
            draggingRef.current.lastOnSeekTime = now;
        }
    }, [onSeek]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        dragTimeRef.current = currentTimeRef.current;
        draggingRef.current.isDragging = true;
        draggingRef.current.startX = e.clientX;
        draggingRef.current.startTime = currentTimeRef.current;

        velocityRef.current = 0;
        lastTimestampRef.current = performance.now();
        lastXRef.current = e.clientX;

        if (momentumFrameRef.current) {
            cancelAnimationFrame(momentumFrameRef.current);
            momentumFrameRef.current = null;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        if (onScratch) onScratch(0);
    }, [onScratch]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current.isDragging) return;

        const now = performance.now();
        const dt_ms = now - lastTimestampRef.current;
        if (dt_ms < 1) return;

        const deltaPixels = e.clientX - draggingRef.current.startX;
        const dt_sec = -(deltaPixels / pixelsPerSecondRef.current);
        const newTime = Math.max(0, Math.min(duration, draggingRef.current.startTime + dt_sec));

        const dx = e.clientX - lastXRef.current;
        const timeDiff = -(dx / pixelsPerSecondRef.current);
        const instantaneousVelocity = timeDiff / (dt_ms / 1000);
        velocityRef.current = velocityRef.current * 0.4 + instantaneousVelocity * 0.6;

        lastTimestampRef.current = now;
        lastXRef.current = e.clientX;

        dragTimeRef.current = newTime;
        throttledSeek(newTime); // Call throttled version

        if (onScratch) onScratch(velocityRef.current);
    }, [duration, throttledSeek, onScratch]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setIsDragging(false);
        draggingRef.current.isDragging = false;
        
        // Final sync
        if (dragTimeRef.current !== null) {
            onSeek(dragTimeRef.current);
        }

        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore capture release error */ }

        if (Math.abs(velocityRef.current) > 0.05) {
            const animate = (now: number) => {
                const dt = (now - lastTimestampRef.current) / 1000;
                lastTimestampRef.current = now;
                velocityRef.current *= friction;
                
                if (dragTimeRef.current !== null) {
                    let nextTime = dragTimeRef.current + velocityRef.current * dt;
                    if (nextTime <= 0) { nextTime = 0; velocityRef.current = 0; }
                    else if (nextTime >= duration) { nextTime = duration; velocityRef.current = 0; }
                    
                    dragTimeRef.current = nextTime;
                    throttledSeek(nextTime);
                    if (onScratch) onScratch(velocityRef.current);
                }

                if (Math.abs(velocityRef.current) > 0.01) {
                    momentumFrameRef.current = requestAnimationFrame(animate);
                } else {
                    momentumFrameRef.current = null;
                    dragTimeRef.current = null;
                    if (onReleaseScratch) onReleaseScratch();
                }
            };
            lastTimestampRef.current = performance.now();
            momentumFrameRef.current = requestAnimationFrame(animate);
        } else {
            dragTimeRef.current = null;
            if (onReleaseScratch) onReleaseScratch();
        }
    }, [duration, onSeek, onScratch, onReleaseScratch, throttledSeek]);

    return (
        <div
            ref={containerRef}
            className={`scrollable-waveform ${isDragging ? 'dragging' : ''}`}
            style={{ '--waveform-color': color, height: `${height}px`, touchAction: 'none' } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <canvas ref={canvasRef} />
            {(isLoading || (!waveformData && audioUrl)) && (
                <div className="waveform-loading-overlay" style={{ touchAction: 'none' }}>
                    <span>{isLoading ? 'Loading Track...' : 'Analyzing...'}</span>
                </div>
            )}
        </div>
    );
};

export const ScrollableWaveform = React.memo(ScrollableWaveformComponent);
