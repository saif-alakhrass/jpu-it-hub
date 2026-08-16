import { describe, expect, it } from 'vitest';
import { toggleInList, toggleInSet } from './collections';

describe('toggleInSet', () => {
  it('adds a missing value without mutating the input', () => {
    const original = new Set(['a']);
    const next = toggleInSet(original, 'b');
    expect([...next]).toEqual(['a', 'b']);
    expect([...original]).toEqual(['a']);
  });

  it('removes an existing value', () => {
    expect([...toggleInSet(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });
});

describe('toggleInList', () => {
  it('appends a missing value and removes an existing one', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });
});
