import React, { useEffect, useRef, useState, useCallback } from 'react';
import './ScrollableWaveform.css';

interface ScrollableWaveformProps {
    audioUrl: string | null;
    audioBuffer?: AudioBuffer | null;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
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

    // Derived view time: use dragTime if dragging, otherwise prop currentTime
    // This ensures smooth 60fps dragging even if parent updates are slower
    const viewTime = isDragging && dragTime !== null ? dragTime : currentTime;

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

        const bgColor = '#111';
        const gridColor = 'rgba(255, 255, 255, 0.1)';
        const gridBeatColor = 'rgba(255, 255, 255, 0.3)';

        // Clear
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, containerWidth, height);

        if (!waveformData) return;

        const pixelsPerSecond = pixelsPerSecondRef.current;
        const peaks = waveformData.peaks;
        const samplesPerSecondVisual = (peaks.length / 2) / waveformData.duration;

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
            ctx.strokeStyle = gridColor;
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
            ctx.strokeStyle = gridBeatColor;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // 2. Draw Waveform
        const barWidth = 2;
        const gap = 1;
        const effectivePixelStep = barWidth + gap;

        // Colors
        const playedColor = color;
        const unplayedColor = adjustAlpha(color, 0.5);

        for (let x = 0; x < containerWidth; x += effectivePixelStep) {
            const timeAtX = startTime + (x / pixelsPerSecond);
            if (timeAtX < 0 || timeAtX > waveformData.duration) continue;

            const peakIdx = Math.floor(timeAtX * samplesPerSecondVisual) * 2;
            if (peakIdx >= peaks.length - 1) continue;

            const min = peaks[peakIdx];
            const max = peaks[peakIdx + 1];

            const top = centerY - (max * centerY * 0.9);
            const bottom = centerY - (min * centerY * 0.9);
            const barH = bottom - top;

            if (x < centerX) {
                ctx.fillStyle = playedColor;
            } else {
                ctx.fillStyle = unplayedColor;
            }

            ctx.fillRect(x, top, barWidth, barH);
        }

        // 3. Draw Playhead (Fixed Center)
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(centerX - 5, 0);
        ctx.lineTo(centerX + 5, 0);
        ctx.lineTo(centerX, 6);
        ctx.fill();

    }, [waveformData, viewTime, color, bpm, duration, height]);
    // Handle Scrubbing (Seek only)
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        setDragTime(currentTime); // Initialize drag time
        draggingRef.current.isDragging = true;
        draggingRef.current.startX = e.clientX;
        draggingRef.current.startTime = currentTime;

        e.currentTarget.setPointerCapture(e.pointerId);
    }, [currentTime]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current.isDragging) return;

        const deltaPixels = e.clientX - draggingRef.current.startX;
        const dt = -(deltaPixels / pixelsPerSecondRef.current); // Seconds change
        const newTime = Math.max(0, Math.min(duration, draggingRef.current.startTime + dt));

        setDragTime(newTime);
        onSeek(newTime);

    }, [duration, onSeek]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setIsDragging(false);
        draggingRef.current.isDragging = false;
        setDragTime(null);

        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { }
    }, []);

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

function adjustAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}

export const ScrollableWaveform = React.memo(ScrollableWaveformComponent);
