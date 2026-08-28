// components/pane/ChoiceRack.tsx
//
// RPG choice buttons. The visible half of open question 3.
//
// The idempotency of the choice round-trip is a TYPE, not a disabled flag: the rack is a
// discriminated union, and the `resolved` branch has no `onChoose` path to reach. A
// component holding a `resolved` rack cannot fire a second turn even if the player mashes
// it, and there is no `hasChosen` boolean anywhere to forget to set.

'use client';

import type { JSX } from 'react';
import type { ChoiceRack as Rack } from '../../lib/client/useOracleTurn';

export interface ChoiceRackProps {
  rack: Rack;
  /** Only ever called from the `pending` branch. */
  onChoose: (choiceId: string) => void;
}

/**
 * USAGE:
 *   {rack && <ChoiceRack rack={rack} onChoose={choose} />}
 *
 * Renders `risk` as a glyph, not a word: safe = a plain dot, costly = a coin, unknown = a
 * hairline question mark. PRD §4.4 — "choosing is informed but not solved", so the glyph
 * is the only affordance and there is no probability text.
 *
 * `usesItemId` puts the item's 16x16 icon in the button, which is the cheapest possible
 * demonstration of the PRD §4.4 beat: pick up the crowbar and the door's options grow an
 * option with a crowbar in it.
 */
export default function ChoiceRack({ rack, onChoose }: ChoiceRackProps): JSX.Element {
  throw new Error('not implemented');
  // TODO  slide up staggered 40ms apart (ARCHITECTURE §7), reduced-motion -> no stagger
  //       resolved: collapse to a single chosen chip, the others fade to 15% and stay
  //                 visible — the player should see the road not taken
}
