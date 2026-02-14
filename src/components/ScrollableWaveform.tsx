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

    // Local drag time state for smooth visual updates independent of parent render cycle
    const [dragTime, setDragTime] = useState<number | null>(null);

    // We use a ref for dragging mechanics to avoid closure staleness in event handlers
    const draggingRef = useRef({
        isDragging: false,
        startX: 0,
        startTime: 0
    });

    const pixelsPerSecondRef = useRef<number>(100);

    // Parse color to RGB components
    const colorToRGB = useCallback((hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }, []);

    // Generate waveform peaks from audio buffer
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

                    let min = 0;
                    let max = 0;

                    for (let j = start; j < end; j += 10) {
                        const sample = channel[j];
                        if (sample < min) min = sample;
                        if (sample > max) max = sample;
                    }

                    peaks[i * 2] = min;
                    peaks[i * 2 + 1] = max;
                }

                setWaveformData({ peaks, duration: buffer.duration });
            } catch (error) {
                console.error('Error generating waveform:', error);
            }
        };

        generatePeaks();
    }, [audioUrl, audioBuffer]);

    // Physics Refs for momentum
    const velocityRef = useRef(0);
    const lastTimestampRef = useRef(0);
    const lastXRef = useRef(0);
    const momentumFrameRef = useRef<number | null>(null);
    const friction = 0.92; // Friction coefficient

    // Derived view time: use dragTime if dragging or momentum is active, otherwise prop currentTime
    const viewTime = (isDragging || momentumFrameRef.current !== null) && dragTime !== null ? dragTime : currentTime;

    // Draw waveform
    React.useLayoutEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();

        const targetWidth = Math.floor(rect.width * dpr);
        const targetHeight = Math.floor(height * dpr);

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${height}px`;
        }

        ctx.resetTransform();
        ctx.scale(dpr, dpr);

        const containerWidth = rect.width;

        // Clear with dark gradient background
        const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#0d0d0d');
        bgGradient.addColorStop(0.5, '#151515');
        bgGradient.addColorStop(1, '#0d0d0d');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, containerWidth, height);

        if (!waveformData) return;

        const pixelsPerSecond = pixelsPerSecondRef.current;
        const peaks = waveformData.peaks;
        const samplesPerSecondVisual = (peaks.length / 2) / waveformData.duration;
        const rgb = colorToRGB(color);

        // Calculate view window based on VIEW TIME (which is smooth)
        const halfWindowSeconds = (containerWidth / pixelsPerSecond) / 2;
        const startTime = viewTime - halfWindowSeconds;
        const endTime = viewTime + halfWindowSeconds;

        const centerY = height / 2;
        const centerX = containerWidth / 2;

        // 1. Draw Beat Grid
        if (bpm && bpm > 0) {
            const secondsPerBeat = 60 / bpm;
            const firstBeatTime = Math.ceil(startTime / secondsPerBeat) * secondsPerBeat;

            ctx.beginPath();
            for (let t = firstBeatTime; t < endTime; t += secondsPerBeat) {
                const x = (t - startTime) * pixelsPerSecond;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            for (let t = firstBeatTime; t < endTime; t += secondsPerBeat) {
                const isDownBeat = Math.round(t / secondsPerBeat) % 4 === 0;
                if (isDownBeat) {
                    const x = (t - startTime) * pixelsPerSecond;
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                }
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // 2. Draw Waveform Bars - Clean mirrored style
        const barWidth = 2;
        const gap = 1;
        const effectivePixelStep = barWidth + gap;

        for (let x = 0; x < containerWidth; x += effectivePixelStep) {
            const timeAtX = startTime + (x / pixelsPerSecond);
            if (timeAtX < 0 || timeAtX > waveformData.duration) continue;

            const peakIdx = Math.floor(timeAtX * samplesPerSecondVisual) * 2;
            if (peakIdx >= peaks.length - 1) continue;

            const min = peaks[peakIdx];
            const max = peaks[peakIdx + 1];

            const topHeight = max * centerY * 0.85;
            const bottomHeight = -min * centerY * 0.85;

            const isPast = x < centerX;
            const alpha = isPast ? 1.0 : 0.45;

            // Gradient color based on amplitude for more visual interest
            const amplitude = Math.max(Math.abs(max), Math.abs(min));
            const bright = Math.min(1, amplitude * 1.5 + 0.3);

            // Top bar (positive)
            if (topHeight > 0.5) {
                const topGrad = ctx.createLinearGradient(0, centerY - topHeight, 0, centerY);
                topGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * bright})`);
                topGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
                ctx.fillStyle = topGrad;
                ctx.fillRect(x, centerY - topHeight, barWidth, topHeight);
            }

            // Bottom bar (negative) - mirrored
            if (bottomHeight > 0.5) {
                const botGrad = ctx.createLinearGradient(0, centerY, 0, centerY + bottomHeight);
                botGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
                botGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * bright})`);
                ctx.fillStyle = botGrad;
                ctx.fillRect(x, centerY, barWidth, bottomHeight);
            }
        }

        // 3. Center line (subtle divider)
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(containerWidth, centerY);
        ctx.stroke();

        // 4. Draw Playhead (Fixed Center) - Clean white line with glow
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();
        ctx.restore();

        // Triangle marker at top
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(centerX - 5, 0);
        ctx.lineTo(centerX + 5, 0);
        ctx.lineTo(centerX, 7);
        ctx.fill();

        // Triangle marker at bottom
        ctx.beginPath();
        ctx.moveTo(centerX - 5, height);
        ctx.lineTo(centerX + 5, height);
        ctx.lineTo(centerX, height - 7);
        ctx.fill();

    }, [waveformData, viewTime, color, bpm, duration, height, colorToRGB]);

    // Handle Scrubbing (Drag to seek)
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        setDragTime(currentTime);
        draggingRef.current.isDragging = true;
        draggingRef.current.startX = e.clientX;
        draggingRef.current.startTime = currentTime;

        // Reset physics
        velocityRef.current = 0;
        lastTimestampRef.current = performance.now();
        lastXRef.current = e.clientX;

        // Cancel any existing momentum
        if (momentumFrameRef.current) {
            cancelAnimationFrame(momentumFrameRef.current);
            momentumFrameRef.current = null;
        }

        e.currentTarget.setPointerCapture(e.pointerId);

        // Start scratch mode in audio
        if (onScratch) {
            onScratch(0);
        }
    }, [currentTime, onScratch]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current.isDragging) return;

        const now = performance.now();
        const dt_ms = now - lastTimestampRef.current;
        if (dt_ms < 1) return; // Avoid division by zero

        const deltaPixels = e.clientX - draggingRef.current.startX;
        const dt_sec = -(deltaPixels / pixelsPerSecondRef.current);
        const newTime = Math.max(0, Math.min(duration, draggingRef.current.startTime + dt_sec));

        // Calculate velocity (change in time per change in real time)
        const dx = e.clientX - lastXRef.current;
        const timeDiff = -(dx / pixelsPerSecondRef.current);
        const instantaneousVelocity = timeDiff / (dt_ms / 1000);

        // Smooth velocity a bit
        velocityRef.current = velocityRef.current * 0.4 + instantaneousVelocity * 0.6;

        lastTimestampRef.current = now;
        lastXRef.current = e.clientX;

        setDragTime(newTime);
        onSeek(newTime);

        if (onScratch) {
            onScratch(velocityRef.current);
        }

    }, [duration, onSeek, onScratch]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setIsDragging(false);
        draggingRef.current.isDragging = false;

        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { }

        // Start momentum if velocity is high enough
        if (Math.abs(velocityRef.current) > 0.1) {
            const startMomentum = () => {
                let lastTime = performance.now();
                let currentPos = dragTime !== null ? dragTime : currentTime;

                const animate = (now: number) => {
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;

                    // Apply friction/decay
                    velocityRef.current *= friction;

                    // Update position
                    currentPos += velocityRef.current * dt;

                    // Bounce/Stop at boundaries
                    if (currentPos <= 0) {
                        currentPos = 0;
                        velocityRef.current = 0;
                    } else if (currentPos >= duration) {
                        currentPos = duration;
                        velocityRef.current = 0;
                    }

                    setDragTime(currentPos);
                    onSeek(currentPos);

                    if (onScratch) {
                        onScratch(velocityRef.current);
                    }

                    if (Math.abs(velocityRef.current) > 0.01) {
                        momentumFrameRef.current = requestAnimationFrame(animate);
                    } else {
                        momentumFrameRef.current = null;
                        setDragTime(null);
                        if (onReleaseScratch) onReleaseScratch();
                    }
                };
                momentumFrameRef.current = requestAnimationFrame(animate);
            };
            startMomentum();
        } else {
            setDragTime(null);
            // Resume audio
            if (onReleaseScratch) {
                onReleaseScratch();
            }
        }
    }, [dragTime, currentTime, duration, onSeek, onScratch, onReleaseScratch]);

    return (
        <div
            ref={containerRef}
            className={`scrollable-waveform ${isDragging ? 'dragging' : ''}`}
            style={{ '--waveform-color': color, height: `${height}px` } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <canvas ref={canvasRef} />
            {(isLoading || (!waveformData && audioUrl)) && (
                <div className="waveform-loading-overlay">
                    <span>{isLoading ? 'Loading Track...' : 'Analyzing...'}</span>
                </div>
            )}
        </div>
    );
};

export const ScrollableWaveform = React.memo(ScrollableWaveformComponent);
