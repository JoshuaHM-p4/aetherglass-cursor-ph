# AGENTS.md — rules for Cursor on this repo

Read `docs/ARCHITECTURE.md` before writing code. These rules exist because the failure mode of
this project is architectural drift under time pressure, and drift is invisible until the demo.

---

## Non-negotiable

1. **The LLM never mutates state directly.** All changes go through
   `applyAction(state, action)` in `lib/sim/reducer.ts`. A tool's `execute` may only dispatch
   an action and return the result. If you find yourself writing `state.player.hp -= 2` inside
   a tool, stop.

2. **Every mutating tool validates first.** Check preconditions in `lib/sim/rules.ts` and return
   `{ ok: false, reason: '<snake_case_reason>' }` on failure. Never throw. The reason string is
   fed back to the model so it can narrate the failure — that's a feature, not an error path.

3. **`grant` is closed-world.** An item may only be granted if its id exists in the item registry
   *and* appears in the source entity's `contents` or `rewardPool`. Never let the model name a
   new item id into existence.

4. **One id space.** LDtk `iid` === sim entity id === `sprite.name` in Phaser === the `entityId`
   argument to `focus_entity`. Do not introduce a mapping layer.

5. **No LLM calls in the combat or movement loop.** Ever. Those are 60fps paths.

6. **Phaser never re-mounts.** `components/GameCanvas.tsx` uses
   `dynamic(..., { ssr: false })` and takes **no props**. React↔Phaser communication is the
   EventBus in `game/EventBus.ts`, in both directions. If you're tempted to pass state as a prop,
   emit an event instead.

7. **No `window`, `document`, or `Phaser` references at module scope** in anything reachable from
   a server component. Guard or move inside a lifecycle method.

8. **The API key lives only in `app/api/oracle/route.ts`.** No `NEXT_PUBLIC_` AI keys, no
   client-side fetches to a model provider.

---

## Conventions

- TypeScript strict. `lib/sim/**` imports nothing from `react`, `next`, or `phaser`.
- Zod schemas in `lib/oracle/tools.ts` are the single source of truth for tool shapes — derive
  TS types with `z.infer`, don't hand-write parallel interfaces.
- Sim reducers are pure and synchronous. `structuredClone` the state, mutate the clone, return it.
- Event and reason strings are `snake_case`. Item and entity ids are `snake_case`.
- Tailwind for layout and the Pane. No CSS-in-JS. Phaser draws everything inside the canvas.
- Prefer adding an item **tag** over adding a code branch. Tags are how the game gets deeper
  without getting bigger.

## AI SDK specifics (v6)

- `tool({ description, inputSchema, execute })` — the parameter is `inputSchema`, not `parameters`.
- `convertToModelMessages` is **async** — await it.
- Custom data parts are written with `writer.write({ type: 'data-<name>', data })` inside
  `createUIMessageStream`, and received client-side via `useChat`'s `onData`.
- Tool descriptions should state **when to call**, not what the tool does. Write them as
  instructions to an actor: "Call this the moment you first mention something in the world."

## When you're unsure

Ask before: changing the id scheme, adding a fourth layer, introducing a database, adding a
second LLM round-trip per turn, or moving state into React. Everything else, just build it.

## Don't

- Don't add auth, persistence, or multiplayer. See `docs/PRD.md` §5.
- Don't write a "safety" prompt telling the model not to cheat. Write a validator.
- Don't generate tilesets with an image model. See `docs/ASSETS.md` §5.
- Don't refactor the sim after hour 8.
