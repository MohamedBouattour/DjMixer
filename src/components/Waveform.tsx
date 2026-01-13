import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import './Waveform.css';

interface WaveformProps {
    audioUrl: string | null;
    currentTime: number;
    onSeek: (time: number) => void;
    isPlaying: boolean;
    color: string;
}

export const Waveform: React.FC<WaveformProps> = ({
    audioUrl,
    currentTime,
    onSeek,
    // isPlaying,
    color
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: color + '80', // Slightly more opaque
            progressColor: color,
            cursorColor: color,
            cursorWidth: 2,
            barWidth: 2,
            barGap: 1,
            barRadius: 3,
            height: 100,
            normalize: true,
            interact: true,
            dragToSeek: true
        });

        wavesurfer.on('interaction', () => {
            onSeek(wavesurfer.getCurrentTime());
        });

        wavesurferRef.current = wavesurfer;

        return () => {
            wavesurfer.destroy();
        };
    }, [color, onSeek]);

    useEffect(() => {
        if (audioUrl && wavesurferRef.current) {
            wavesurferRef.current.load(audioUrl).catch((err) => {
                if (err.name === 'AbortError') return;
                console.warn('WaveSurfer load error:', err);
            });
        }
    }, [audioUrl]);

    useEffect(() => {
        if (wavesurferRef.current && audioUrl) {
            const duration = wavesurferRef.current.getDuration();
            if (duration > 0) {
                wavesurferRef.current.seekTo(currentTime / duration);
            }
        }
    }, [currentTime, audioUrl]);

    return (
        <div className="waveform-container">
            <div ref={containerRef} className="waveform" />
        </div>
    );
};
