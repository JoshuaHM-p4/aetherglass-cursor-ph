import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../lib/ldtk/load';

const world = JSON.parse(
  readFileSync(new URL('../public/assets/world.ldtk', import.meta.url), 'utf8'),
);

describe('ldtk load', () => {
  it('uses iid as the entity id', () => {
    const { entities } = loadLevel(world);
    expect(entities.chest_lockbox.id).toBe('chest_lockbox');
    expect(entities.chest_lockbox.contents).toEqual(['crowbar', 'ore_iron']);
    expect(entities.troll_wounded.kind).toBe('elite');
    expect(entities.troll_wounded.tags).toEqual(['wounded', 'hungry']);
    expect(entities.troll_wounded.paneWorthy).toBe(true);
  });

  it('rejects unknown contents ids at boot', () => {
    const bad = structuredClone(world);
    bad.levels[0].layerInstances[0].entityInstances[0].fieldInstances.find(
      (f: { __identifier: string }) => f.__identifier === 'contents',
    ).__value = ['sword_legendary'];
    expect(() => loadLevel(bad)).toThrow(/chest_lockbox/);
  });
});
