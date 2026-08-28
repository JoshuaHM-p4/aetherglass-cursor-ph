# Aetherglass — Architecture

> Written against Next.js 16, Phaser 4.1, AI SDK 6 (`ai@^6`, `@ai-sdk/react@^3`).
> The AI SDK moves fast — if a symbol below doesn't exist, check `ai-sdk.dev/docs` before
> rewriting the design around it. The v5→v6 rename to watch for: `parameters` → `inputSchema`,
> and `convertToModelMessages` is now async.

---

## 1. Three layers, hard boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  WORLD  — Phaser 4                                          │
│  tilemap · sprites · movement · collision · sword combat    │
│  particles · camera · the spotlight effect                  │
│  Owns: pixels and physics.  Decides: nothing.               │
└───────────────▲─────────────────────────┬───────────────────┘
                │ events                  │ intents
                │ (moved, hit, entered)   │ (interact:chest_03)
┌───────────────┴─────────────────────────▼───────────────────┐
│  SIM  — plain TypeScript, no framework, no async            │
│  hp · bag · flags · entity states · recipes · validators    │
│  applyAction(state, action) => { state, events }            │
│  Owns: truth. This is the only place state changes.         │
└───────────────▲─────────────────────────┬───────────────────┘
                │ tool calls              │ context packet
                │ (validated!)            │ (small JSON snapshot)
┌───────────────┴─────────────────────────▼───────────────────┐
│  PANE  — LLM behind /api/oracle                             │
│  reads a snapshot · narrates · proposes tool calls          │
│  Owns: voice and judgment.  Stores: nothing.                │
└─────────────────────────────────────────────────────────────┘
```

Three rules that make the whole thing hold together:

1. **The Pane never holds state.** Every request ships a fresh snapshot. There is no "the model
   remembers you picked up the crowbar" — the crowbar is in the packet or it isn't.
2. **Every mutation is validated.** A tool call is a *proposal*. `rules.ts` checks
   preconditions and can reject. Rejections go back to the model as tool results.
3. **Phaser is downstream of the sim, not beside it.** Phaser reads sim state to draw. It never
   keeps its own copy of HP.

### Why bother

Because the failure mode of every LLM game demo is the model confidently narrating that you
opened a chest you already opened, or handing you an item that doesn't exist. Judges find that
within thirty seconds. This structure makes it impossible rather than unlikely.

---

## 2. The sim

Pure functions, no imports from React or Phaser. This means you can unit-test the entire game
without a browser, which matters at hour 9 when nothing renders.

```ts
// lib/sim/reducer.ts
export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'OPEN_CONTAINER': {
      const e = state.entities[action.entityId];
      if (!e || e.kind !== 'container') return reject(state, 'no_such_container');
      if (e.state === 'open')            return reject(state, 'already_open');
      if (e.locked && !hasKeyFor(state, e)) return reject(state, 'locked');

      const next = structuredClone(state);
      next.entities[action.entityId].state = 'open';
      const loot = e.contents ?? [];
      loot.forEach(item => grant(next, item));

      return {
        state: next,
        ok: true,
        events: [
          { type: 'container_opened', entityId: e.id },
          ...loot.map(i => ({ type: 'item_gained', itemId: i.id } as const)),
        ],
      };
    }
    // DAMAGE, HEAL, GRANT_ITEM, CONSUME_ITEM, CRAFT, SET_FLAG, UNLOCK, ...
  }
}
```

`reject()` returns `{ state, ok: false, reason }` — **unchanged state plus a reason string**.
That reason is what goes back to the model, and it's why the Pane can narrate its own failures
convincingly. `already_open` becomes "You have already emptied it. I am not going to pretend
otherwise." That line writes itself and it always lands.

State lives in a Zustand store. React subscribes for the HUD, Phaser subscribes for rendering:

```ts
// lib/sim/store.ts
export const useGame = create<Store>((set, get) => ({
  state: initialState,
  dispatch: (action) => {
    const { state, events, ok, reason } = applyAction(get().state, action);
    set({ state });
    events.forEach(e => EventBus.emit('sim:event', e));   // -> Phaser reacts
    return { ok, reason, events };
  },
}));
```

---

## 3. The context packet

Small, flat, and regenerated every turn. Aim for under 1200 tokens. Never send the tilemap.

```ts
// lib/oracle/context.ts
export function buildContextPacket(s: GameState): ContextPacket {
  return {
    player: {
      hp: s.player.hp, hpMax: s.player.hpMax,
      paneIntegrity: s.player.paneIntegrity,   // 0-100, drives the voice
      facing: s.player.facing,
      position: { x: s.player.tx, y: s.player.ty },
    },
    // ids + tags only. The model reasons over tags, not names.
    inventory: s.player.bag.map(i => ({ id: i.id, name: i.name, tags: i.tags, qty: i.qty })),
    // nearest 8, so the Pane can only talk about what's actually in view
    nearby: nearestEntities(s, 8).map(e => ({
      id: e.id, kind: e.kind, name: e.name,
      state: e.state, tags: e.tags, distance: e.d,
    })),
    focus: s.ui.interactTargetId ?? null,     // what the player pressed Enter on
    recentEvents: s.log.slice(-5),            // ["killed slime", "took 2 damage"]
    flags: pickPublicFlags(s.flags),
  };
}
```

Two details that pay off:

- **Tags over names.** `tags: ['pry','heavy','iron']` on a crowbar and `tags: ['sealed','wood']`
  on a door means the model works out that prying is possible without you writing that rule
  anywhere. Add a new item with `pry` and every sealed thing in the game gets a new solution
  for free. This is the highest-leverage thing in the codebase.
- **`nearby` capped at 8** keeps the Pane from narrating rooms you haven't reached, which is
  the most common immersion break in LLM games.

---

## 4. The tool schema

Full source in `starter/tools.ts`. Shape:

| Tool | Effect | Validated against |
|---|---|---|
| `focus_entity` | Spotlights an entity in the world | id must be in `nearby` |
| `offer_choices` | Renders 2–4 choice buttons in the Pane | — (pure UI) |
| `open_container` | Opens a chest/lockbox, grants contents | not already open, not locked |
| `unlock` | Unlocks a door/container using an item | item present, tags compatible |
| `apply_effect` | damage / heal / grant / consume / set_flag | per-effect rules; grants capped |
| `suggest_craft` | Names a craftable recipe (**read-only**) | ingredients actually held |
| `identify` | Reveals an item's lore and hidden tags | item in bag |

`apply_effect` is the dangerous one. Constrain it:

- `grant` may only produce item ids that exist in the item registry **and** are listed in the
  target entity's `contents` or `rewardPool`. No open-ended item creation, ever.
- `damage` is clamped to a per-turn maximum so a single unlucky roll can't end the demo.
- `set_flag` is restricted to a fixed enum of quest flags.

Write these limits in `rules.ts`, not in the prompt. Prompts are suggestions; validators are law.

---

## 5. Narrative focus — the signature effect

This is the thing people will remember, so build it early and make it look expensive.

**Server** streams a custom data part next to the text:

```ts
// app/api/oracle/route.ts
import { anthropic } from '@ai-sdk/anthropic';
import {
  streamText, tool, convertToModelMessages,
  createUIMessageStream, createUIMessageStreamResponse,
} from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, packet } = await req.json();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: anthropic('claude-sonnet-4-6'),
        system: buildSystemPrompt(packet),
        messages: await convertToModelMessages(messages),
        tools: {
          focus_entity: tool({
            description:
              'Draw the player\'s eye to one nearby entity. Call this the moment you first ' +
              'mention something in the world. Only ids present in nearby[] are valid.',
            inputSchema: z.object({
              entityId: z.string(),
              style: z.enum(['spotlight', 'pulse', 'shatter']).default('spotlight'),
            }),
            execute: async ({ entityId, style }) => {
              if (!packet.nearby.some((e: any) => e.id === entityId)) {
                return { ok: false, reason: 'not_nearby' };
              }
              writer.write({ type: 'data-focus', data: { entityId, style } });
              return { ok: true };
            },
          }),
          // ...the rest, see starter/tools.ts
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

**Client** forwards the data part straight into Phaser:

```tsx
// components/pane/Pane.tsx
const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/oracle',
    prepareSendMessagesRequest: ({ messages }) => ({
      body: { messages, packet: buildContextPacket(useGame.getState().state) },
    }),
  }),
  onData: (part) => {
    if (part.type === 'data-focus') EventBus.emit('world:focus', part.data);
  },
});
```

**Phaser** does the work:

```ts
// game/systems/focus.ts
EventBus.on('world:focus', ({ entityId, style }) => {
  const target = scene.entityLayer.getByName(entityId);
  if (!target) return;

  scene.dimLayer.setAlpha(0);
  scene.tweens.add({ targets: scene.dimLayer, alpha: 0.55, duration: 220 });
  scene.cameras.main.pan(target.x, target.y, 400, 'Sine.easeInOut');
  scene.spotlight.setPosition(target.x, target.y).setVisible(true);

  if (style === 'pulse') scene.tweens.add({
    targets: scene.spotlight, scale: { from: 0.9, to: 1.15 },
    yoyo: true, repeat: 2, duration: 300,
  });

  scene.time.delayedCall(2600, () => {
    scene.tweens.add({ targets: scene.dimLayer, alpha: 0, duration: 400 });
    scene.spotlight.setVisible(false);
  });
});
```

Because `focus_entity` is called *during* generation, the spotlight lands while the sentence
is still typing. That sync is the whole effect. Don't wait for the message to finish.

---

## 6. Phaser inside Next.js

The two gotchas that eat an hour:

```tsx
// components/GameCanvas.tsx
'use client';
import dynamic from 'next/dynamic';
const Game = dynamic(() => import('@/game/PhaserGame'), { ssr: false });
export default function GameCanvas() { return <Game />; }
```

- **Never touch `window` at module scope** in anything Phaser imports. Config objects that read
  `window.innerWidth` at the top level will break the build, not just dev.
- **React must not re-render the canvas.** The `<div id="game-container">` mounts once. All
  communication is the EventBus, never props. If Phaser re-inits on every keystroke, this is why.

Pixel-art config:

```ts
new Phaser.Game({
  type: Phaser.AUTO,
  width: 480, height: 270,       // internal res; CSS scales it up
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [Boot, Preload, Overworld],
});
```

---

## 7. The Pane's look

Resist default glassmorphism. The Pane is a cracked arcane instrument, not a macOS panel.

- **Surface:** `backdrop-filter: blur(14px) saturate(1.2)` over a `rgba(14,16,24,0.42)` fill.
  A 1px border with a gradient from warm amber at the top-left to cold nothing at the
  bottom-right, so it reads as glass catching torchlight from one side.
- **Cracks:** an absolutely-positioned SVG overlay of hairline fractures, `opacity` bound to
  `1 - paneIntegrity/100`. It literally cracks as you take damage. One asset, huge payoff.
- **Type:** narration in a warm serif (Crimson Pro / EB Garamond) — the Pane is old and literate.
  Stats and item names in a pixel face (`m6x11`, Silkscreen) so they belong to the game, not the
  chat. The contrast between the two faces is the design idea: an ancient voice reading a
  machine's world.
- **Motion:** narration ink-bleeds in per word rather than typewriter-per-character. Choices
  slide up staggered 40ms apart. When the Pane is thinking, the blur radius breathes. Nothing else moves.
- **Position:** anchored right, vertically centered, ~380px wide, and it *drifts* — a slow 6s
  y-axis float with a slight rotation. It's hovering, so let it hover.

Respect `prefers-reduced-motion` on the drift and the ink-bleed.

---

## 8. Latency

Under 900ms to first token or the demo feels broken.

1. **Stream.** Non-negotiable. First token is the only latency the player perceives.
2. **Prefetch on proximity.** When the player comes within 3 tiles of a `paneWorthy` entity,
   fire the request in the background and buffer it. Pressing Enter reveals a response that's
   already half-generated. This is the single biggest perceived-speed win available.
3. **Pre-bake flavor.** Static descriptions (item lore, room ambience, first-look text) are
   generated at build time into `public/assets/flavor.json`. See ASSETS §5. Live calls are
   reserved for genuinely dynamic moments — negotiation, choices, consequences.
4. **Cache the system prompt.** It's constant; only the packet changes. Anthropic prompt caching
   pays for itself immediately at demo-loop frequency.
5. **Small model for small jobs.** Item identification and ambient one-liners don't need your
   best model. Route those to Haiku and keep the good model for parley.

---

## 9. Failure modes and what to do

| Symptom | Cause | Fix |
|---|---|---|
| Pane narrates items you don't have | Packet built from stale state | Build the packet inside `prepareSendMessagesRequest`, never in a `useEffect` |
| Spotlight hits the wrong thing | Phaser object names ≠ LDtk iids | Set `sprite.name = ldtkEntity.iid` at spawn, single source of ids |
| Model refuses to call tools | Description too vague | Descriptions should say *when* to call, not what it does |
| Canvas remounts constantly | Props flowing into the Phaser component | EventBus only |
| Choices repeat | Prior choices missing from context | Append offered choices to `recentEvents` |
| Everything is slow at the venue | Cold serverless + bad wifi | Run `next build && next start` locally, demo on localhost |
