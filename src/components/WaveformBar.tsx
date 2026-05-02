import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { cn } from '../utils/cn';

interface WaveformBarProps {
    audioUrl: string | null;
    currentTime: number;
    duration?: number;
    onSeek: (time: number) => void;
    color: string;
    height?: number;
    className?: string;
}

const WaveformBarComponent: React.FC<WaveformBarProps> = ({
    audioUrl,
    currentTime,
    duration,
    onSeek,
    color,
    height = 50,
    className
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    // Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !audioUrl) return;

        // Destroy previous instance
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
        }

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(255, 255, 255, 0.5)',
            progressColor: color,
            cursorColor: color,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: height,
            normalize: true,
            interact: true, // Allow clicking
            dragToSeek: true,
            autoScroll: true,
            fillParent: true,
            url: audioUrl,
        });

        wavesurfer.on('interaction', (newTime) => {
            onSeek(newTime);
        });

        wavesurfer.on('click', () => {
            // Interaction handles seek, ensuring we call onSeek
            onSeek(wavesurfer.getCurrentTime());
        });

        // Mute internal audio since we use our own audio element
        wavesurfer.setVolume(0);

        wavesurferRef.current = wavesurfer;

        return () => {
            if (wavesurfer) {
                wavesurfer.destroy();
            }
        };
    }, [audioUrl, color, height, onSeek]);

    // Sync current time
    useEffect(() => {
        if (wavesurferRef.current && duration) {
            // We can't easily sync exact playback state without the media element
            // But we can update the progress cursor visually
            // WaveSurfer keeps its own internal time state which might drifts if we don't sync

            // Only seek if difference is significant to avoid stutter
            const currentWsTime = wavesurferRef.current.getCurrentTime();
            if (Math.abs(currentWsTime - currentTime) > 0.1) {
                const progress = currentTime / duration;
                if (!isNaN(progress) && isFinite(progress)) {
                    wavesurferRef.current.seekTo(progress);
                }
            }
        }
    }, [currentTime, duration]);

    return (
        <div
            ref={containerRef}
            className={cn("w-full bg-black/20 rounded-lg mb-2 overflow-hidden", className)}
            style={{ height: `${height}px` }}
        />
    );
};

export const WaveformBar = React.memo(WaveformBarComponent);
