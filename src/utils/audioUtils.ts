import type { Track } from '../types';

export const loadAudioFile = async (file: File): Promise<Track> => {
    const url = URL.createObjectURL(file);

    // Get duration
    const audio = new Audio(url);
    await new Promise((resolve) => {
        audio.addEventListener('loadedmetadata', resolve);
    });

    const track: Track = {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name.replace(/\.[^/.]+$/, ''),
        duration: audio.duration,
        url,
        file
    };

    return track;
};

export const detectBPM = async (audioBuffer: AudioBuffer): Promise<number> => {
    try {
        // Simple peak detection for BPM
        const channel = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const windowSize = Math.floor(sampleRate * 0.02);

        const peaks: number[] = [];
        for (let i = 0; i < channel.length; i += windowSize) {
            let sum = 0;
            for (let j = 0; j < windowSize && i + j < channel.length; j++) {
                sum += Math.abs(channel[i + j]);
            }
            peaks.push(sum / windowSize);
        }

        // Find intervals between peaks
        const threshold = Math.max(...peaks) * 0.6;
        const peakIndices: number[] = [];
        for (let i = 0; i < peaks.length; i++) {
            if (peaks[i] > threshold) {
                peakIndices.push(i);
            }
        }

        // Calculate average interval
        if (peakIndices.length < 2) return 120; // Default BPM

        const intervals: number[] = [];
        for (let i = 1; i < peakIndices.length; i++) {
            intervals.push(peakIndices[i] - peakIndices[i - 1]);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        let bpm = Math.round((60 * 1000) / ((avgInterval * windowSize) / sampleRate * 1000));

        // Normalize BPM to reasonable DJ range (60-180)
        // Keep halving if too high
        while (bpm > 180) {
            bpm = Math.round(bpm / 2);
        }
        // Keep doubling if too low
        while (bpm < 60 && bpm > 0) {
            bpm = Math.round(bpm * 2);
        }

        // Final sanity check
        if (bpm < 60 || bpm > 180 || isNaN(bpm)) {
            return 120; // Default fallback
        }

        return bpm;
    } catch (error) {
        console.error('BPM detection error:', error);
        return 120; // Default fallback
    }
};
