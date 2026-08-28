'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { JSX } from 'react';
import type { ChoiceRack as Rack } from '../../lib/client/useOracleTurn';

export interface ChoiceRackProps {
  rack: Rack;
  /** Only ever called from the `pending` branch. */
  onChoose: (choiceId: string) => void;
}

export default function ChoiceRack({ rack, onChoose }: ChoiceRackProps): JSX.Element {
  const reduced = useReducedMotion();

  return (
    <div className="mt-3 space-y-2">
      <p className="font-pixel text-[10px] leading-snug text-amber-100/80">{rack.prompt}</p>
      <ul className="flex flex-col gap-1.5">
        {rack.choices.map((choice, i) => (
          <ChoiceRow
            key={choice.id}
            choice={choice}
            index={i}
            reduced={Boolean(reduced)}
            rack={rack}
            onChoose={onChoose}
          />
        ))}
      </ul>
    </div>
  );
}

type Offered = Rack['choices'][number];

function ChoiceRow({
  choice,
  index,
  reduced,
  rack,
  onChoose,
}: {
  choice: Offered;
  index: number;
  reduced: boolean;
  rack: Rack;
  onChoose: (choiceId: string) => void;
}): JSX.Element {
  const inner = (
    <>
      <RiskGlyph risk={choice.risk} />
      <span className="font-pixel text-[11px] leading-snug">{choice.label}</span>
    </>
  );
  const frame =
    'flex w-full items-start gap-2 border border-amber-400/25 bg-black/25 px-2.5 py-1.5 text-left text-amber-50/90';

  if (rack.status === 'pending') {
    return (
      <motion.li
        initial={reduced ? false : { y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.28, delay: reduced ? 0 : index * 0.04, ease: 'easeOut' }}
      >
        <button type="button" className={`${frame} hover:border-amber-300/70 hover:bg-black/40`} onClick={() => onChoose(choice.id)}>
          {inner}
        </button>
      </motion.li>
    );
  }

  const chosen = rack.chosenId === choice.id;
  return (
    <li className={chosen ? '' : 'opacity-[0.15]'}>
      <div className={`${frame} ${chosen ? 'border-amber-300/70' : ''}`}>{inner}</div>
    </li>
  );
}

function RiskGlyph({ risk }: { risk: Offered['risk'] }) {
  const label = risk === 'safe' ? '·' : risk === 'costly' ? '◎' : '?';
  return (
    <span className="mt-0.5 font-pixel text-[10px] text-amber-300/80" title={risk} aria-label={risk}>
      {label}
    </span>
  );
}
