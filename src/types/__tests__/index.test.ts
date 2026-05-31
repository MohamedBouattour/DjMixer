import { describe, it, expect } from 'vitest';
import { DEFAULT_KEY_MAP } from '../index';

describe('DEFAULT_KEY_MAP', () => {
  it('contains all expected actions', () => {
    const expectedActions = [
      'DECK_A_PLAY', 'DECK_A_CUE',
      'DECK_B_PLAY', 'DECK_B_CUE',
      'VOLUME_A_UP', 'VOLUME_A_DOWN',
      'VOLUME_B_UP', 'VOLUME_B_DOWN',
      'CROSSFADER_LEFT', 'CROSSFADER_RIGHT',
      'EFFECT_A_TOGGLE', 'EFFECT_B_TOGGLE',
    ];

    for (const action of expectedActions) {
      expect(DEFAULT_KEY_MAP).toHaveProperty(action);
    }
  });

  it('has string values for all entries', () => {
    for (const value of Object.values(DEFAULT_KEY_MAP)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('has non-empty keys', () => {
    for (const key of Object.keys(DEFAULT_KEY_MAP)) {
      expect(key).toBeTruthy();
    }
  });
});
