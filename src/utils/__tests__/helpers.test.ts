import { describe, it, expect } from 'vitest';
import { formatTime, formatTotalSeconds, generateId } from '../helpers';

describe('formatTime', () => {
  it('returns 0:00 for 0', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('returns 0:00 for NaN', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('returns 0:00 for undefined/falsy', () => {
    expect(formatTime(undefined as unknown as number)).toBe('0:00');
  });

  it('formats seconds correctly', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(59)).toBe('0:59');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('pads seconds with leading zero', () => {
    expect(formatTime(1)).toBe('0:01');
    expect(formatTime(10)).toBe('0:10');
    expect(formatTime(70)).toBe('1:10');
  });


});

describe('formatTotalSeconds', () => {
  it('returns 0s for 0', () => {
    expect(formatTotalSeconds(0)).toBe('0s');
  });

  it('returns 0s for NaN', () => {
    expect(formatTotalSeconds(NaN)).toBe('0s');
  });

  it('formats positive numbers', () => {
    expect(formatTotalSeconds(5)).toBe('5s');
    expect(formatTotalSeconds(120)).toBe('120s');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns a 7-character string', () => {
    expect(generateId().length).toBe(7);
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
