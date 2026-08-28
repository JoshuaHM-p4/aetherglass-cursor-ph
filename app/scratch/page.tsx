'use client';

import { useState } from 'react';
import { applyAction, initialState } from '../../lib/sim/reducer';
import { instantiate } from '../../lib/sim/registry';
import type { Action, ActionResult, GameState } from '../../lib/sim/types';

function run(state: GameState, action: Action): ActionResult {
  return applyAction(state, action);
}

export default function ScratchPage() {
  const [state, setState] = useState<GameState>(() => {
    const s = initialState();
    s.player.bag.push(instantiate('crowbar'));
    return s;
  });
  const [last, setLast] = useState<ActionResult | null>(null);

  const act = (action: Action) => {
    const result = run(state, action);
    setLast(result);
    setState(result.state);
  };

  return (
    <main style={{ fontFamily: 'monospace', color: '#c9a86a', padding: 24 }}>
      <h1>sim scratch</h1>
      <p>
        hp {state.player.hp}/{state.player.hpMax} · bag{' '}
        {state.player.bag.map((i) => i.id).join(', ')} · lockbox{' '}
        {state.entities.chest_lockbox.state}
        {state.entities.chest_lockbox.locked ? ' locked' : ''}
      </p>
      <p>
        <button type="button" onClick={() => act({ type: 'UNLOCK', entityId: 'chest_lockbox', withItemId: 'crowbar' })}>
          pry lockbox
        </button>{' '}
        <button type="button" onClick={() => act({ type: 'OPEN_CONTAINER', entityId: 'chest_lockbox' })}>
          open lockbox
        </button>{' '}
        <button type="button" onClick={() => act({ type: 'DAMAGE', amount: 2, source: 'scratch' })}>
          take 2 damage
        </button>
      </p>
      {last && (
        <pre>{JSON.stringify({ ok: last.ok, reason: last.reason, events: last.events }, null, 2)}</pre>
      )}
    </main>
  );
}
