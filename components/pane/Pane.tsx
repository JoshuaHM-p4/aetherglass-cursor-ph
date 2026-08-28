// components/pane/Pane.tsx
//
// The glass. Tailwind only, no CSS-in-JS. Phaser draws nothing here and this draws
// nothing in the canvas.
//
// This file is the proof that the deep-interface bet paid off: it imports exactly two
// things from lib/ — `useOracleTurn` and a store selector for integrity — and contains
// no packet, no transport, no data-part handling, and no knowledge that prefetch exists.

'use client';

import { useOracleTurn, type ChoiceRack, type PaneMessage, type PaneStatus } from '../../lib/client/useOracleTurn';

/**
 * No props, on purpose. The Pane reads the store and the hook; a prop would be a second
 * source for something one of those already owns.
 *
 * USAGE (this is the whole call site):
 *
 *   const { messages, status, rack, ask, choose } = useOracleTurn();
 *   const integrity = useGame(s => s.state.player.paneIntegrity);
 *
 *   <Glass integrity={integrity} status={status}>
 *     {messages.map(m => <PaneMessageView key={m.id} {...m} />)}
 *     {rack && <ChoiceRack rack={rack} onChoose={choose} />}
 *     <PaneInput disabled={status === 'thinking'} onSubmit={ask} />
 *   </Glass>
 */
export default function Pane(): JSX.Element {
  const { messages, status, ask } = useOracleTurn();
  const thinking = status === 'thinking';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <ol className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((m) => (
          <li key={m.id} className="text-sm">
            <span className="font-medium">{m.role}</span>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = String(new FormData(event.currentTarget).get('ask') ?? '').trim();
          if (text === '') return;
          ask(text);
          event.currentTarget.reset();
        }}
      >
        <input
          name="ask"
          type="text"
          disabled={thinking}
          className="min-w-0 flex-1 border px-2 py-1 disabled:opacity-50"
          placeholder="speak"
        />
        <button type="submit" disabled={thinking} className="border px-3 py-1 disabled:opacity-50">
          ask
        </button>
      </form>
    </div>
  );
}

/**
 * Visual treatment per ARCHITECTURE §7. `integrity` drives the crack overlay's opacity
 * (`1 - integrity/100`) directly from the store — the same number `tierOf()` reads for
 * the prompt. One source, two consumers, no sync step: the glass looks as broken as it
 * sounds because both are functions of the same integer.
 */
export function Glass(props: {
  integrity: number;
  status: PaneStatus;
  children: React.ReactNode;
}): JSX.Element {
  throw new Error('not implemented');
  // TODO  backdrop-blur-[14px] saturate-[1.2] over rgba(14,16,24,0.42)
  //       1px gradient border: warm amber top-left -> transparent bottom-right
  //       6s y-drift + slight rotate, disabled under prefers-reduced-motion
  //       status === 'thinking' -> the blur radius breathes; nothing else moves
}

/** Ink-bleed per word, not typewriter per character. Refusal chips render struck through. */
export function PaneMessageView(props: PaneMessage): JSX.Element {
  throw new Error('not implemented');
}

export type { ChoiceRack };
