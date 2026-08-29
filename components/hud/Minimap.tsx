'use client';

import { useMemo, type JSX } from 'react';
import { minimapOf, type MiniFill, type MiniRoom } from '../../lib/sim/minimap';
import type { Facing } from '../../lib/sim/types';
import { useGame } from '../useGame';

const CELL = 16;
const ROOM = 10;
const GAP = CELL - ROOM;
const INSET = GAP / 2;
const TUNNEL = 3;

const FILL: Record<MiniFill, string> = {
  current: '#e4c36a',
  cave: '#6a6572',
  fountain: '#4a7ea8',
  master: '#7a5aa0',
};

function roomXY(gx: number, gy: number, originX: number, originY: number): { x: number; y: number } {
  return { x: (gx - originX) * CELL + INSET, y: (gy - originY) * CELL + INSET };
}

function doorRect(x: number, y: number, dir: Facing): { x: number; y: number; w: number; h: number } {
  if (dir === 'up') return { x: x + 3.5, y: y - 1.5, w: 3, h: 2 };
  if (dir === 'down') return { x: x + 3.5, y: y + ROOM - 0.5, w: 3, h: 2 };
  if (dir === 'left') return { x: x - 1.5, y: y + 3.5, w: 2, h: 3 };
  return { x: x + ROOM - 0.5, y: y + 3.5, w: 2, h: 3 };
}

function ChestMarks({ room, x, y }: { room: MiniRoom; x: number; y: number }): JSX.Element | null {
  const n = Math.min(room.chests, 2);
  if (n === 0) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={x + ROOM - 3.5 - i * 3}
          y={y + ROOM - 3.5}
          width={2.5}
          height={2.5}
          fill="#c9a86a"
        />
      ))}
    </>
  );
}

export default function Minimap(): JSX.Element | null {
  const state = useGame((s) => s.state);
  const model = useMemo(() => minimapOf(state), [state]);
  if (model.rooms.length === 0) return null;

  const xs = model.rooms.map((r) => r.gx);
  const ys = model.rooms.map((r) => r.gy);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = Math.max(...ys) - minY + 1;
  const w = cols * CELL;
  const h = rows * CELL;

  return (
    <div
      className="pointer-events-none absolute top-5 left-5 z-30 h-[min(20vmin,9rem)] w-[min(20vmin,9rem)] p-1.5"
      aria-label="dungeon map"
    >
      <div
        className="pane-glass flex h-full w-full items-center justify-center p-1.5"
        style={{ boxShadow: '0 8px 22px rgba(0,0,0,0.4), inset 0 1px 0 rgba(201,168,106,0.16)' }}
      >
        <svg
          viewBox={`-2 -2 ${w + 4} ${h + 4}`}
          className="h-full w-full overflow-visible"
          shapeRendering="crispEdges"
        >
          {model.tunnels.map((t, i) => {
            const a = roomXY(t.ax, t.ay, minX, minY);
            const b = roomXY(t.bx, t.by, minX, minY);
            const acx = a.x + ROOM / 2;
            const acy = a.y + ROOM / 2;
            const bcx = b.x + ROOM / 2;
            const bcy = b.y + ROOM / 2;
            const horiz = Math.abs(t.bx - t.ax) >= Math.abs(t.by - t.ay);
            if (horiz) {
              const left = Math.min(acx, bcx) + ROOM / 2 - 0.5;
              const width = Math.abs(bcx - acx) - ROOM + 1;
              return (
                <rect
                  key={`t${i}`}
                  x={left}
                  y={acy - TUNNEL / 2}
                  width={Math.max(width, GAP - 1)}
                  height={TUNNEL}
                  fill="#3a3640"
                />
              );
            }
            const top = Math.min(acy, bcy) + ROOM / 2 - 0.5;
            const height = Math.abs(bcy - acy) - ROOM + 1;
            return (
              <rect
                key={`t${i}`}
                x={acx - TUNNEL / 2}
                y={top}
                width={TUNNEL}
                height={Math.max(height, GAP - 1)}
                fill="#3a3640"
              />
            );
          })}
          {model.rooms.map((room) => {
            const { x, y } = roomXY(room.gx, room.gy, minX, minY);
            return (
              <g key={room.id}>
                <rect x={x} y={y} width={ROOM} height={ROOM} fill={FILL[room.fill]} />
                {room.fill === 'current' && (
                  <rect
                    x={x - 0.6}
                    y={y - 0.6}
                    width={ROOM + 1.2}
                    height={ROOM + 1.2}
                    fill="none"
                    stroke="#f3e0a6"
                    strokeWidth={0.9}
                  />
                )}
                {room.doors.map((dir) => {
                  const d = doorRect(x, y, dir);
                  return (
                    <rect
                      key={dir}
                      x={d.x}
                      y={d.y}
                      width={d.w}
                      height={d.h}
                      fill="#d4b06a"
                    />
                  );
                })}
                <ChestMarks room={room} x={x} y={y} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
