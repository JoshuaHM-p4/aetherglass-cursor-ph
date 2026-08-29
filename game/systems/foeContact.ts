import type { Entity } from '../../lib/sim/types';

/** HP taken on body contact. `null` means this foe never hurts by standing on you. */
export function contactDamage(entity: Pick<Entity, 'tags'>): number | null {
  if (entity.tags.includes('passive')) return null;
  if (entity.tags.includes('cyclops')) return null;
  return 1;
}
