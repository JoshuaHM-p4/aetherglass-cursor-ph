import { beforeEach, describe, expect, it } from 'vitest';
import { initialState } from '../lib/sim/reducer';
import {
  clearSave,
  clearSlot,
  getActiveSlot,
  listSlots,
  setActiveSlot,
  writeSave,
} from '../lib/client/save';

function mockStorage(): void {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => mem.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mem.set(key, value);
        },
        removeItem: (key: string) => {
          mem.delete(key);
        },
      },
    },
    configurable: true,
  });
  clearSave();
}

describe('save slots', () => {
  beforeEach(mockStorage);

  it('clearSlot empties one file and leaves the others', () => {
    const a = initialState(1);
    a.player.name = 'ash';
    const b = initialState(2);
    b.player.name = 'violet';

    setActiveSlot(0);
    writeSave(a);
    setActiveSlot(1);
    writeSave(b);

    clearSlot(0);

    const slots = listSlots();
    expect(slots[0]).toBeNull();
    expect(slots[1]?.player.name).toBe('violet');
    expect(getActiveSlot()).toBe(1);
  });

  it('clearSlot of the active file drops the active pointer', () => {
    const a = initialState(3);
    a.player.name = 'squire';
    setActiveSlot(2);
    writeSave(a);

    clearSlot(2);

    expect(listSlots()[2]).toBeNull();
    expect(getActiveSlot()).toBeNull();
  });
});
