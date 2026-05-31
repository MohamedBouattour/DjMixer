import { describe, it, expect } from 'vitest';
import { getKeyLabel } from '../keyHelpers';

describe('getKeyLabel', () => {
  it('returns empty string for null/undefined', () => {
    expect(getKeyLabel(null, 'qwerty')).toBe('');
    expect(getKeyLabel(undefined, 'qwerty')).toBe('');
  });

  describe('qwerty layout', () => {
    it('strips Key prefix', () => {
      expect(getKeyLabel('KeyQ', 'qwerty')).toBe('Q');
      expect(getKeyLabel('KeyA', 'qwerty')).toBe('A');
    });

    it('strips Digit prefix', () => {
      expect(getKeyLabel('Digit1', 'qwerty')).toBe('1');
    });

    it('handles Arrow keys', () => {
      expect(getKeyLabel('ArrowLeft', 'qwerty')).toBe(' LEFT');
      expect(getKeyLabel('ArrowRight', 'qwerty')).toBe(' RIGHT');
    });

    it('handles Space key', () => {
      expect(getKeyLabel('Space', 'qwerty')).toBe('SPC');
    });

    it('handles Period', () => {
      expect(getKeyLabel('Period', 'qwerty')).toBe('.');
    });

    it('handles Comma', () => {
      expect(getKeyLabel('Comma', 'qwerty').trim()).toBe(',');
    });
  });

  describe('azerty layout', () => {
    it('maps Q to A', () => {
      expect(getKeyLabel('KeyQ', 'azerty')).toBe('A');
    });

    it('maps W to Z', () => {
      expect(getKeyLabel('KeyW', 'azerty')).toBe('Z');
    });

    it('maps A to Q', () => {
      expect(getKeyLabel('KeyA', 'azerty')).toBe('Q');
    });

    it('maps Z to W', () => {
      expect(getKeyLabel('KeyZ', 'azerty')).toBe('W');
    });

    it('maps Quote to ù', () => {
      expect(getKeyLabel('Quote', 'azerty')).toBe('ù');
    });

    it('maps number keys to french chars', () => {
      expect(getKeyLabel('Digit1', 'azerty')).toBe('&');
      expect(getKeyLabel('Digit2', 'azerty')).toBe('é');
    });
  });
});
