'use client';

import { hearts } from '../../lib/sim/select';
import { useGame } from '../useGame';

export default function Hearts() {
  const state = useGame((s) => s.state);
  const cells = hearts(state);

  return (
    <ul className="flex gap-1" aria-label={`health ${state.player.hp} of ${state.player.hpMax}`}>
      {cells.map((cell, i) => (
        <li key={i} aria-hidden>
          <Heart fill={cell} />
        </li>
      ))}
    </ul>
  );
}

function Heart({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const color = fill === 'empty' ? '#3a3140' : '#c45c5c';
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" className="drop-shadow-[0_1px_0_#1a1014]">
      {fill === 'half' ? (
        <>
          <path d="M9 14 L2.2 8.2 A4.2 4.2 0 0 1 9 3.4 Z" fill="#3a3140" />
          <path d="M9 14 L15.8 8.2 A4.2 4.2 0 0 0 9 3.4 Z" fill={color} />
        </>
      ) : (
        <path
          d="M9 14.2 L2.1 8.1 A4.3 4.3 0 0 1 9 3.2 A4.3 4.3 0 0 1 15.9 8.1 Z"
          fill={color}
          stroke="#1a1014"
          strokeWidth="1"
        />
      )}
    </svg>
  );
}
