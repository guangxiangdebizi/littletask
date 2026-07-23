import { describe, expect, it } from 'vitest';

import { assertActionTransition, canTransitionAction } from './action-state';

describe('action state machine', () => {
  it('allows explicit confirmation from a ready action', () => {
    expect(canTransitionAction('ready', 'confirmed')).toBe(true);
  });

  it('blocks execution before confirmation', () => {
    expect(canTransitionAction('ready', 'executing')).toBe(false);
    expect(() => assertActionTransition('ready', 'executing')).toThrow(
      'Invalid action transition: ready -> executing',
    );
  });

  it('does not allow a succeeded action to run again', () => {
    expect(canTransitionAction('succeeded', 'executing')).toBe(false);
  });
});
