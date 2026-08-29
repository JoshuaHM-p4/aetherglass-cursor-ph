import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEM_REGISTRY } from '../lib/sim/registry';

describe('item icons', () => {
  it('every registered item has a 16×16 icon file', () => {
    const files = new Set(readdirSync('public/assets/items'));
    for (const id of Object.keys(ITEM_REGISTRY)) {
      expect(files.has(`${id}.png`), `missing public/assets/items/${id}.png`).toBe(true);
    }
  });
});
