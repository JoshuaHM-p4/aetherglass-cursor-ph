'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import { useReducedMotion } from 'motion/react';
import { bus } from '../../game/EventBus';
import { readPlayerAnchor } from '../../game/playerAnchor';
import { ITEM_REGISTRY } from '../../lib/sim/registry';
import ItemIcon from './ItemIcon';

type Floater = { id: number; itemId: string; name: string; slot: number };

const RISE_MS = 220;
const HOLD_MS = 640;
const FLY_MS = 520;
const STAGGER_MS = 150;

let nextId = 1;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeIn(t: number): number {
  return t * t;
}

function bagTarget(): { x: number; y: number } {
  const overlay = document.querySelector('[data-play-overlay]');
  const bag = document.querySelector('[data-bag-button]');
  if (!(overlay instanceof HTMLElement) || !(bag instanceof HTMLElement)) {
    return { x: window.innerWidth / 2 + 64, y: window.innerHeight - 44 };
  }
  const o = overlay.getBoundingClientRect();
  const b = bag.getBoundingClientRect();
  return { x: b.left + b.width / 2 - o.left, y: b.top + 6 - o.top };
}

export default function PickupFloat(): JSX.Element {
  const [items, setItems] = useState<Floater[]>([]);

  useEffect(() => {
    let burst = 0;
    let burstAt = 0;
    return bus.on('sim:event', (event) => {
      if (event.type !== 'item_gained' && event.type !== 'crafted') return;
      const now = performance.now();
      if (now - burstAt > 80) burst = 0;
      burstAt = now;
      const itemId = event.itemId;
      const name = ITEM_REGISTRY[itemId]?.name ?? itemId.replace(/_/g, ' ');
      const slot = burst;
      burst += 1;
      setItems((list) => [...list.slice(-5), { id: nextId++, itemId, name, slot }]);
    });
  }, []);

  return (
    <>
      {items.map((item) => (
        <PickupChip
          key={item.id}
          item={item}
          onDone={() => setItems((list) => list.filter((it) => it.id !== item.id))}
        />
      ))}
    </>
  );
}

function PickupChip({ item, onDone }: { item: Floater; onDone: () => void }): JSX.Element {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const el = ref.current;
    const face = inner.current;
    if (!el || !face) return;

    if (reduced) {
      const a = readPlayerAnchor();
      el.style.left = `${a.x}px`;
      el.style.top = `${a.y - 36}px`;
      el.style.visibility = 'visible';
      face.style.opacity = '1';
      const t = window.setTimeout(() => onDoneRef.current(), 700);
      return () => window.clearTimeout(t);
    }

    let raf = 0;
    const t0 = performance.now();
    const delay = item.slot * STAGGER_MS;
    const total = delay + RISE_MS + HOLD_MS + FLY_MS;
    let freeze: { x: number; y: number } | null = null;
    let finished = false;

    const tick = (now: number) => {
      if (finished) return;
      const elapsed = now - t0;
      if (elapsed >= total) {
        finished = true;
        onDoneRef.current();
        return;
      }
      const t = elapsed - delay;
      if (t < 0) {
        el.style.visibility = 'hidden';
        raf = requestAnimationFrame(tick);
        return;
      }
      el.style.visibility = 'visible';
      const a = readPlayerAnchor();
      const headX = a.x;
      const headY = a.y - 30;
      let x = headX;
      let y = headY;
      let op = 1;
      let sc = 1;

      if (t < RISE_MS) {
        const u = easeOut(t / RISE_MS);
        y = headY - 20 * u;
        op = u;
        sc = 0.62 + 0.38 * u;
      } else if (t < RISE_MS + HOLD_MS) {
        const hold = t - RISE_MS;
        y = headY - 20 - Math.sin((hold / 200) * Math.PI) * 3;
        freeze = { x: headX, y };
      } else {
        const u = easeIn(Math.min(1, (t - RISE_MS - HOLD_MS) / FLY_MS));
        const from = freeze ?? { x: headX, y: headY - 20 };
        const bag = bagTarget();
        x = from.x + (bag.x - from.x) * u;
        y = from.y + (bag.y - from.y) * u;
        op = 1 - u * 0.85;
        sc = 1 - 0.55 * u;
      }

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      face.style.opacity = String(op);
      face.style.transform = `scale(${sc})`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      finished = true;
      cancelAnimationFrame(raf);
    };
  }, [item.slot]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full"
      style={{ visibility: 'hidden', left: 0, top: 0 }}
    >
      <div
        ref={inner}
        className="flex items-center gap-1.5 border border-amber-400/55 bg-black/80 px-1.5 py-1 shadow-[0_0_12px_rgba(201,168,106,0.25)]"
      >
        <ItemIcon id={item.itemId} size={18} />
        <span className="font-pixel text-[8px] leading-none tracking-wide text-amber-100">
          {item.name}
        </span>
      </div>
    </div>
  );
}
