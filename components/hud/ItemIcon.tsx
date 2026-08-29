'use client';

import { useState } from 'react';
import { itemGlyph } from './glyphs';

export function itemIconSrc(id: string): string {
  return `/assets/items/${id}.png`;
}

export default function ItemIcon({
  id,
  size = 24,
  className = '',
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className={`font-pixel text-[9px] leading-none text-amber-200/90 ${className}`}>
        {itemGlyph(id)}
      </span>
    );
  }
  return (
    <img
      src={itemIconSrc(id)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setBroken(true)}
      className={`pointer-events-none select-none ${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
