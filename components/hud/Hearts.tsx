'use client';

import { hearts, heartsFromHp } from '../../lib/sim/select';
import { useGame } from '../useGame';

export default function Hearts() {
  const state = useGame((s) => s.state);
  const cells = hearts(state);

  return (
    <ul className="flex gap-1" aria-label={`health ${state.player.hp} of ${state.player.hpMax}`}>
      {cells.map((cell, i) => (
        <li key={i} aria-hidden>
          <HeartMark fill={cell} />
        </li>
      ))}
    </ul>
  );
}

export function HeartRow({
  hp,
  hpMax,
  size = 12,
}: {
  hp: number;
  hpMax: number;
  size?: number;
}) {
  const cells = heartsFromHp(hp, hpMax);
  return (
    <ul className="flex gap-px" aria-label={`health ${hp} of ${hpMax}`}>
      {cells.map((cell, i) => (
        <li key={i} aria-hidden>
          <HeartMark fill={cell} size={size} />
        </li>
      ))}
    </ul>
  );
}

export function HeartMark({
  fill,
  size = 18,
}: {
  fill: 'full' | 'half' | 'empty';
  size?: number;
}) {
  const color = fill === 'empty' ? '#3a3140' : '#c45c5c';
  const h = Math.round((size * 16) / 18);
  return (
    <svg width={size} height={h} viewBox="0 0 18 16" className="drop-shadow-[0_1px_0_#1a1014]">
      {fill === 'half' ? (
        <>
          <path
            d="M9 14.2 L2.1 8.1 A4.3 4.3 0 0 1 9 3.2 A4.3 4.3 0 0 1 15.9 8.1 Z"
            fill="#3a3140"
            stroke="#1a1014"
            strokeWidth="1"
          />
          <path d="M9 14 L2.2 8.2 A4.2 4.2 0 0 1 9 3.4 Z" fill={color} />
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
