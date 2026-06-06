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

/**
 * Advanced BPM Detection using Onset Detection + Autocorrelation
 * 
 * This algorithm:
 * 1. Applies a low-pass filter to focus on bass/kick drums
 * 2. Calculates onset strength (energy changes)
 * 3. Uses autocorrelation to find the most likely tempo
 * 4. Validates against common DJ BPM ranges
 */
export const detectBPM = async (audioBuffer: AudioBuffer): Promise<number> => {
    try {
        const sampleRate = audioBuffer.sampleRate;
        const channel = audioBuffer.getChannelData(0);

        // Step 1: Downsample for faster processing (target ~11kHz)
        const downsampleFactor = Math.max(1, Math.floor(sampleRate / 11025));
        const downsampled = downsample(channel, downsampleFactor);
        const effectiveSampleRate = sampleRate / downsampleFactor;

        // Step 2: Apply simple low-pass filter to focus on bass frequencies
        const filtered = lowPassFilter(downsampled, effectiveSampleRate, 200);

        // Step 3: Calculate onset strength (energy envelope)
        const hopSize = Math.floor(effectiveSampleRate * 0.01); // 10ms hops
        const frameSize = Math.floor(effectiveSampleRate * 0.02); // 20ms frames
        const onsetStrength = calculateOnsetStrength(filtered, frameSize, hopSize);

        // Step 4: Autocorrelation to find tempo
        const minBPM = 60;
        const maxBPM = 200;
        const minLag = Math.floor((60 / maxBPM) * (effectiveSampleRate / hopSize));
        const maxLag = Math.floor((60 / minBPM) * (effectiveSampleRate / hopSize));

        const autocorr = autocorrelation(onsetStrength, minLag, maxLag);

        // Find peaks in autocorrelation
        const peaks = findPeaks(autocorr, minLag);

        if (peaks.length === 0) {
            return 120; // Default fallback
        }

        // Convert the strongest peak to BPM
        const strongestPeak = peaks[0];
        const lagFrames = minLag + strongestPeak;
        const lagSeconds = lagFrames * (hopSize / effectiveSampleRate);
        let bpm = 60 / lagSeconds;

        // Step 5: Normalize to DJ range (70-180 BPM)
        // Most electronic music is in this range
        while (bpm > 180) {
            bpm = bpm / 2;
        }
        while (bpm < 70 && bpm > 0) {
            bpm = bpm * 2;
        }

        // Round to nearest 0.5
        bpm = Math.round(bpm * 2) / 2;

        // Sanity check
        if (isNaN(bpm) || bpm < 60 || bpm > 200) {
            return 120;
        }

        return bpm;
    } catch (error) {
        console.error('BPM detection error:', error);
        return 120;
    }
};

/**
 * Downsample audio by averaging samples
 */
function downsample(samples: Float32Array, factor: number): Float32Array {
    const newLength = Math.floor(samples.length / factor);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        let sum = 0;
        for (let j = 0; j < factor; j++) {
            sum += Math.abs(samples[i * factor + j]);
        }
        result[i] = sum / factor;
    }

    return result;
}

/**
 * Simple RC low-pass filter
 */
function lowPassFilter(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    const alpha = dt / (rc + dt);

    const result = new Float32Array(samples.length);
    result[0] = samples[0];

    for (let i = 1; i < samples.length; i++) {
        result[i] = result[i - 1] + alpha * (samples[i] - result[i - 1]);
    }

    return result;
}

/**
 * Calculate onset strength (spectral flux approximation)
 */
function calculateOnsetStrength(samples: Float32Array, frameSize: number, hopSize: number): Float32Array {
    const numFrames = Math.max(0, Math.floor((samples.length - frameSize) / hopSize));
    const onsets = new Float32Array(numFrames);

    let prevEnergy = 0;

    for (let i = 0; i < numFrames; i++) {
        const start = i * hopSize;
        let energy = 0;

        for (let j = 0; j < frameSize; j++) {
            const sample = samples[start + j];
            energy += sample * sample;
        }
        energy = Math.sqrt(energy / frameSize);

        // Onset is the positive difference in energy
        onsets[i] = Math.max(0, energy - prevEnergy);
        prevEnergy = energy;
    }

    return onsets;
}

/**
 * Calculate autocorrelation for a range of lags
 */
function autocorrelation(signal: Float32Array, minLag: number, maxLag: number): Float32Array {
    const result = new Float32Array(maxLag - minLag);

    // Normalize signal
    let mean = 0;
    for (let i = 0; i < signal.length; i++) {
        mean += signal[i];
    }
    mean /= signal.length;

    let variance = 0;
    for (let i = 0; i < signal.length; i++) {
        variance += (signal[i] - mean) ** 2;
    }

    for (let lag = minLag; lag < maxLag; lag++) {
        let correlation = 0;
        for (let i = 0; i < signal.length - lag; i++) {
            correlation += (signal[i] - mean) * (signal[i + lag] - mean);
        }
        result[lag - minLag] = correlation / variance;
    }

    return result;
}

/**
 * Find peaks in correlation (potential tempos)
 */
function findPeaks(data: Float32Array, _minLag: number): number[] {
    const peaks: { index: number; value: number }[] = [];

    for (let i = 1; i < data.length - 1; i++) {
        if (data[i] > data[i - 1] && data[i] > data[i + 1] && data[i] > 0.1) {
            peaks.push({ index: i, value: data[i] });
        }
    }

    // Sort by strength
    peaks.sort((a, b) => b.value - a.value);

    // Return top peaks
    return peaks.slice(0, 5).map(p => p.index);
}

/**
 * Generate audio peaks for visualization
 */
export const generateWaveformPeaks = (audioBuffer: AudioBuffer, numPeaks: number = 1000): Float32Array => {
    const channel = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.floor(channel.length / numPeaks);
    const peaks = new Float32Array(numPeaks * 2); // min and max pairs

    for (let i = 0; i < numPeaks; i++) {
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, channel.length);

        let min = 0;
        let max = 0;

        for (let j = start; j < end; j++) {
            const sample = channel[j];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }

        peaks[i * 2] = min;
        peaks[i * 2 + 1] = max;
    }

    return peaks;
};
