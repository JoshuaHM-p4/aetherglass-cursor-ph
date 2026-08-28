# Person A — World + Sim

Read [`HANDOFF.md`](HANDOFF.md) first. Your partner is [`HANDOFF_B.md`](HANDOFF_B.md).

You make it a game. Keyboard, sword, HP from the store, a chest that is really a sim entity. B makes the glass talk; you make the dungeon exist.

Branch after H1: `feat/world`, always rebased onto `main`.

---

## Do not touch

Anything under `lib/oracle/`, `lib/client/`, `components/pane/`, `app/api/oracle/`, `scripts/`.

Do not add keys to `BusEvents`. Do not edit `lib/sim/types.ts`. Do not rewrite `app/page.tsx` after H0.

If B's tool needs a new `Action` or a new `RejectReason`, stop and talk. That is a types change.

---

## Your exclusive files

See the list in `HANDOFF.md`. In practice you live in `lib/sim/**` and `game/**`.

Cross-layer rule: Phaser never keeps its own copy of HP or entity state. Subscribe to `gameStore` for facts; listen on the bus for moments. `sprite.name = entity.id` at spawn. No mapping layer.

---

## H0 — Setup (pair, 30 min)

You drive the scaffold. B watches `.env.local` and the oracle hello.

- `npx create-phaser-game@latest` → Next.js + TypeScript, **into this repo** (sketches already exist — do not let the template overwrite `lib/`, `PLAN.md`, or `game/EventBus.ts` without a diff)
- Install `ai@^6 @ai-sdk/react@^3 @ai-sdk/anthropic zod zustand motion` (B's stack; add it now so both branches compile)
- Confirm `.env.local` is gitignored **before** the first commit
- `components/GameCanvas.tsx` = `dynamic(..., { ssr: false })`, **no props**
- `app/page.tsx` mounts `<GameCanvas/>` only
- Leave `installWorldAdapter` stubbed
- B owns the hardcoded `/api/oracle` hello — do not fill `route.ts`

**Gate:** Phaser canvas renders. Merge `feat/h0-scaffold` to `main`.

---

## H1 — The sim, headless (you, 90 min)

Branch: `feat/h1-sim` from post-H0 `main`. This is the spine. B cannot start `feat/pane` until you merge.

| File | What |
|---|---|
| `lib/sim/rules.ts` | `check`, full `guards` table, `defeatsSeal`, `QUEST_FLAGS`, `LIMITS` |
| `lib/sim/reducer.ts` | `applyAction`, `applyBatch`, `describeEvent`, `initialState` |
| `lib/sim/select.ts` | `nearestEntities`, `isAdjacent`, `findItem`, `bagHasRoomFor`, `hearts` |
| `lib/sim/registry.ts` | 8 authored items |
| `lib/sim/store.ts` | `dispatch` + `hydrate` + `world()`. **`applyVerdict` stays stubbed** |
| `__tests__/sim.test.ts` | **NEW** — the eight cases below |

Eight tests (demo failure modes, not the happy path):

1. Open a locked chest → `locked`
2. Open it twice → `already_open`
3. Pry with the crowbar → ok + `item_gained`
4. Pry with the mushroom → `wrong_tool`
5. Grant an item not in `contents` → `not_in_contents`
6. Grant an unregistered id → `no_such_item`
7. Grant into a full bag → `bag_full`
8. `applyBatch` with a bad second effect → nothing applied

`Guards` is a mapped type over `Action['type']`. A new Action that has no guard must not compile. `applyAction` is `check` then commit — no extra conditionals below the check.

`lib/sim/**` imports nothing from `react`, `next`, or `phaser`.

**Gate:** open a chest and take damage from a scratch page. No Phaser, no LLM. Merge to `main`. Ping B.

---

## H2 — Movement and combat (you, 90 min)

Branch: `feat/world` from post-H1 `main`.

| File | What |
|---|---|
| `game/scenes/Overworld.ts` | Hardcoded tilemap, `spawnEntities`, `syncFromStore` |
| `game/systems/combat.ts` | Facing hitbox, one slime |
| `game/systems/proximity.ts` | Both rings. Only the **reach** ring is used yet. Do not wire prefetch. |
| `game/EventBus.ts` | Fill `installWorldAdapter()` only |

Adapter mapping (already commented in the file):

- `world:tile_entered` → `MOVE`
- `world:attack_landed` → `STRIKE_ENTITY` (reducer decides `dead`, not you)
- `world:player_hurt` → `DAMAGE`, and `DAMAGE_PANE` on heavy hits
- `world:interact` → set `ui.interactTargetId` (store method, not an Action)

`spawnEntities` reads `state.entities` on `sim:hydrated`. That path is shared with H8 LDtk — do not special-case the hardcoded map.

Grey boxes. No art pack swap this hour.

**Gate:** it's a game. Keyboard only. One slime dies. HP display driven by the store. Merge to `main`.

---

## H3 — while B speaks

Do not start H4. Do not "help" in `lib/oracle`.

Allowed:

- Import the asset pack into `public/assets/` (do not swap Overworld onto it yet — that's H6)
- Author LDtk entity fields against the frozen `Entity` type (`kind`, `tags`, `contents`, `paneWorthy`, `seed`, `locked`)
- Keep a paper list of the 8 registry ids so B's prompt copy matches

Rebase `feat/world` when B merges H3.

---

## H4 — Tools (pair, 2 hr) — your half

Sit with B. You type only your files.

| File | What |
|---|---|
| `lib/sim/store.ts` | Fill `applyVerdict` — all four `VerdictOutcome`s: `applied`, `duplicate`, `refused`, `diverged` |
| `lib/sim/recipes.ts` | Enough that `suggest_craft` can return something. Full 6 recipes is H7. |

Order, from `PLAN.md`: B's `propose` first, then your `applyVerdict`, then B's `open_container` end to end. Do not write recipes before the chest opens.

`applyVerdict` re-runs `check` against **live** state. On `diverged`, drop the action and do not mutate. B's journal records the "world moved" line — you just return `{ status: 'diverged', reason }`. Idempotency key is `${turnId}:${seq}`, applied at most once.

**Gate (shared):** the chat opens a chest, the chest is really open, asking for a free legendary sword fails in character. Hand-test divergence: open the chest with Enter while the Pane is mid-sentence. Merge both branches.

---

## H5 — Narrative focus (you, ~50 min)

| File | What |
|---|---|
| `game/systems/focus.ts` | Dim layer, spotlight, camera pan, leader line. Listen for `pane:focus` / `pane:focus_clear` — **not** `world:focus` |

B spends ~10 min retuning the `focus_entity` description. You do not edit `tools.ts`.

**Gate:** the light lands mid-sentence. Record a clip. Merge.

---

## H6 — Art pass, canvas half (you, 90 min)

| File | What |
|---|---|
| `game/scenes/Overworld.ts` | Real tiles and sprites, walk animation, torch flicker |

No new interfaces. If art overruns, grey boxes still play. B is restyling `Pane.tsx` on their branch — no file overlap.

**Gate:** the canvas is photogenic. Merge.

---

## H7 — Recipes (you, ~45 min of the hour)

| File | What |
|---|---|
| `lib/sim/recipes.ts` | 6 recipes, `craftableNow`, `findRecipesFor` |

B builds `BagGrid` / `Hotbar` and fills `flavor.ts`. They **import** `craftableNow`; they do not edit this file. One definition of "craftable" so the Pane cannot suggest something the grid would refuse.

If you are behind: skip the craft panel (cut list 1). `craftableNow` still ships — `suggest_craft` needs it. `CRAFT` and its guard stay.

---

## H8 — Content, world half (you, 60 min)

| File | What |
|---|---|
| `lib/ldtk/load.ts` | Boot-time validation: every `contents` id exists in the registry |

The troll is an `elite` with `paneWorthy`, tags `['wounded','hungry']`, and `troll_pacified` already in `QUEST_FLAGS`. If it needs code, the tag design is wrong.

**Gate:** placing a chest in LDtk gives the Pane something new to talk about with no code change. Cut-list 5 (keep hardcoded map) is free because `spawnEntities` already listens to `sim:hydrated`.

---

## H9 — Polish, your three lines

| File | What |
|---|---|
| `game/systems/proximity.ts` | Wire the **approach** ring to prefetch `arm` / `disarm` |

B owns `prefetch.ts`, `digestPacket`, and the transport `claim` branch. You only emit `world:proximity_enter` / `world:proximity_exit` with `{ entityId, paneWorthy }`.

Then: `next build && next start`, rehearse the 90 seconds together, three times, timed. Sound is cut-list 2 — add `scene.sound.play` only if you have time.

---

## Reminders

- No LLM in the combat or movement loop.
- No `window` / `document` / `Phaser` at module scope in anything the server might import. Game files are client-only; keep it that way.
- Prefer a new item **tag** over a new reducer branch.
- `installWorldAdapter` lives outside any scene. Scenes restart; a second dispatcher is a silent double-move bug.
