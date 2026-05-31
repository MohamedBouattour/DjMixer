import { describe, it, expect, beforeEach } from 'vitest';
import { generateWaveformPeaks, detectBPM } from '../audioUtils';

function createMockAudioBuffer(length: number, sampleRate: number): AudioBuffer {
  const channelData = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
  }
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => channelData,
  } as unknown as AudioBuffer;
}

describe('generateWaveformPeaks', () => {
  let mockBuffer: AudioBuffer;

  beforeEach(() => {
    mockBuffer = createMockAudioBuffer(44100, 44100);
  });

  it('returns a Float32Array', () => {
    const result = generateWaveformPeaks(mockBuffer, 100);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('returns 2 * numPeaks entries', () => {
    const result = generateWaveformPeaks(mockBuffer, 100);
    expect(result.length).toBe(200);
  });

  it('returns min/max pairs', () => {
    const result = generateWaveformPeaks(mockBuffer, 100);
    for (let i = 0; i < 100; i++) {
      expect(result[i * 2]).toBeLessThanOrEqual(result[i * 2 + 1]);
    }
  });

  it('handles single peak', () => {
    const result = generateWaveformPeaks(mockBuffer, 1);
    expect(result.length).toBe(2);
  });
});

describe('detectBPM', () => {
  it('returns a number for valid audio', async () => {
    const buffer = createMockAudioBuffer(44100 * 5, 44100);
    const bpm = await detectBPM(buffer);
    expect(typeof bpm).toBe('number');
    expect(bpm).toBeGreaterThanOrEqual(60);
    expect(bpm).toBeLessThanOrEqual(200);
  });

  it('returns 120 for very short buffer (fallback)', async () => {
    const buffer = createMockAudioBuffer(100, 44100);
    const bpm = await detectBPM(buffer);
    expect(bpm).toBe(120);
  });

  it('handles empty buffer gracefully', async () => {
    const buffer = createMockAudioBuffer(0, 44100);
    const bpm = await detectBPM(buffer);
    expect(bpm).toBe(120);
  });

  it('handles mono audio', async () => {
    const buffer = createMockAudioBuffer(44100 * 3, 44100);
    const bpm = await detectBPM(buffer);
    expect(bpm).toBeGreaterThanOrEqual(60);
    expect(bpm).toBeLessThanOrEqual(200);
  });
});
