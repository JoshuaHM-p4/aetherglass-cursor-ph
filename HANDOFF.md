# Two-person split — read this together

Person A follows [`HANDOFF_A.md`](HANDOFF_A.md) (World + Sim).
Person B follows [`HANDOFF_B.md`](HANDOFF_B.md) (Pane).

The sketches in `lib/`, `game/`, `components/`, `app/` are the contract. Fill `not implemented` bodies against `PLAN.md`. Do not redesign on a branch.

Split by **layer**, not by hour. Hours are a sequence so the demo stays playable; two people on consecutive hours is one person waiting.

```
main  (always playable after a gate merge)
 ├── feat/h0-scaffold     PAIR  — Phaser + Next around the existing sketches
 ├── feat/h1-sim          A     — merge before any parallel work
 ├── feat/world           A     — long-lived; rebase onto main after every gate
 └── feat/pane            B     — long-lived; rebase onto main after every gate
```

---

## Roles

| | Person A — World | Person B — Pane |
|---|---|---|
| Owns | Phaser, combat, the sim, LDtk, assets in-canvas | Oracle route, tools, Pane UI, transport, prefetch |
| Pitch line | "It's a game." | "The glass tells the truth." |
| Stronger at | Phaser, arcade physics, pixel art, LDtk | AI SDK, streaming, React, voice/prompt |
| Idle work | Grey-box map, entity ids, asset pack import | Demo script, voice copy, flavor list, ChatTransport type-check |

---

## Frozen — neither of you edits without a conversation

If a fill-in needs a new field, stop. That is a sketch change, not a branch delta.

| File | Why |
|---|---|
| `lib/sim/types.ts` | One id space, one `Action` union, one `RejectReason` set |
| `game/EventBus.ts` — the `BusEvents` interface only | 14 producer-namespaced events. A may fill `installWorldAdapter()`; nobody adds keys |
| `lib/oracle/protocol.ts` — the type block | Wire shape for verdicts / focus / choices / `offerId` |
| `PLAN.md` build order | What "done" means each hour |
| Id scheme | LDtk `iid` === sim entity id === `sprite.name` === `focus_entity` argument |

Also frozen by `AGENTS.md`: no fourth layer, no database, no second LLM request cycle per turn, no `GameState` in React state, no props on `GameCanvas`.

---

## File ownership — this is how git stays clean

One writer per file. If both of you need a change in the same file, that is a pairing moment: sit together, one types.

### Person A exclusive

```
lib/sim/rules.ts
lib/sim/reducer.ts
lib/sim/select.ts
lib/sim/registry.ts
lib/sim/store.ts          ← including applyVerdict at H4
lib/sim/recipes.ts        ← H4 stub + H7 fill
lib/ldtk/load.ts
__tests__/sim.test.ts     ← A creates this

game/EventBus.ts          ← fill installWorldAdapter only; do not add BusEvents keys
game/scenes/Overworld.ts
game/systems/combat.ts
game/systems/focus.ts
game/systems/proximity.ts ← H2 fill, H9 wire the approach ring
game/main.ts
game/scenes/Boot.ts
game/scenes/Preload.ts
game/scenes/UIScene.ts
game/entities/**          ← if the scaffold creates these

components/GameCanvas.tsx
components/useGame.ts     ← already four lines; leave it unless the store API shifts

public/assets/tiles/**
public/assets/sprites/**
public/assets/world.ldtk
```

### Person B exclusive

```
lib/oracle/journal.ts
lib/oracle/context.ts     ← H3 packet, H9 digestPacket
lib/oracle/prompt.ts      ← H3 fill, H8 VOICE_TIERS tune
lib/oracle/protocol.ts    ← verdictKey body; do not change the types
lib/oracle/turn.ts
lib/oracle/tools.ts       ← H4 fill, H5 description tune
lib/oracle/flavor.ts

lib/client/transport.ts   ← H0 type-check, H3 fill, H9 claim branch
lib/client/useOracleTurn.ts
lib/client/prefetch.ts

app/api/oracle/route.ts

components/pane/Pane.tsx
components/pane/ChoiceRack.tsx
components/pane/PaneMessage.tsx
components/pane/StatGlyphs.tsx

scripts/bake-flavor.mjs
public/assets/flavor.json
```

### One-edit files (coordinate, do not race)

| File | Rule |
|---|---|
| `app/page.tsx` | A mounts `<GameCanvas/>` at H0. B's H3 merge adds `<Pane/>` next to it — that is B's only edit to this file. A does not touch it after H0. |
| `app/layout.tsx` | A, during H0 scaffold. Fonts for the Pane (serif + pixel) are B's H6 concern — add them in `Pane.tsx` / a pane-local import, not by rewriting layout on both branches. |
| `package.json` / lockfile | Whoever needs the dep adds it on their branch. Prefer A adding phaser-side deps and B adding `ai` / `@ai-sdk/*` / `zod` / `motion`. If both need a dep in the same hour, A adds it on `main` first. |
| Root `types.ts`, `tools.ts` | Starter leftovers. Do not fill them in. Real files are `lib/sim/types.ts` and `lib/oracle/tools.ts`. |

### Imports across the cut

A may **import** B's types (`FocusData` from protocol, already referenced by `EventBus.ts`). A may **not** edit B's files.

B may **import** `world()`, `gameStore`, `applyAction`, `craftableNow`, `buildContextPacket` inputs. B may **not** edit `lib/sim/**` or `game/**`.

B emits `pane:*`. A emits `world:*`. Only `store.ts` emits `sim:*`. HUD emits `hud:bag_toggled` — that HUD is B at H7.

---

## Git protocol

1. **Never `git add .`**. Stage named files from your exclusive list.
2. **Never rebase the other person's branch.** Rebase *your* branch onto `main` after they merge a gate.
3. **Do not force-push `main`.** Force-push your own feature branch only if you just rebased it and it has not been shared as a PR someone else is pulling.
4. **Merge to `main` at every hour gate**, not at the end of the day. The other person cannot rebase onto work that only exists on your laptop.
5. **Commit messages:** `H2: keyboard combat against the store` — hour + why. Bodies stay in `PLAN.md`.
6. **No drive-by refactors** in `lib/sim` after it is green. `AGENTS.md`: don't refactor the sim after hour 8; don't start early either.

```bash
# after the other person merges a gate
git checkout feat/world    # or feat/pane
git fetch
git rebase origin/main
```

If rebase hits a file you do not own, you took a wrong turn. Abort and look at the ownership lists.

---

## Calendar — when you must be in the same room

| When | What | Git |
|---|---|---|
| **H0** (30 min) | Scaffold Next + Phaser around the existing sketches. Confirm `.env.local` is gitignored. Canvas renders; `/api/oracle` streams hello. | Pair on `feat/h0-scaffold`, merge to `main` |
| **H1 gate** | A's sim is green. B stops content-sidecar and branches `feat/pane` from this `main`. | A merges `feat/h1-sim` |
| **H4** (2 hr) | Sit together. Files stay exclusive (A: `store.applyVerdict` + `recipes` stub; B: `propose` + tools + rack). Order: `propose` → `applyVerdict` → `open_container` e2e → remaining tools. | Stay on `feat/world` / `feat/pane`; merge both when the chest actually opens |
| **H5** (10 min of B) | A's spotlight; B only retunes `focus_entity`'s description. Record a clip. | Same two branches |
| **H9 rehearsal** | `next build && next start`. Play the 90 seconds aloud, three times, timed. | Whatever is on `main` |

You do **not** need a third integration branch. H4 has no overlapping files if you obey the lists.

---

## Cut list (together, in this order)

1. Crafting UI → keep `suggest_craft`
2. Sound
3. Pane integrity / crack overlay
4. Multiple enemy types
5. LDtk → keep A's hardcoded map
6. Inventory grid → hotbar only

**Never cut:** sim validators, the focus effect, the adversarial "give me a legendary sword" beat.

---

## What "ahead of schedule" is allowed to look like

Allowed without the other person: copy, LDtk entity fields, asset-pack import, the 90-second script, item/recipe lists on paper, Haiku vs Sonnet routing notes.

Not allowed: filling H9 prefetch before H3 speaks; filling H8 LDtk before H2 `spawnEntities` reads `sim:hydrated`; adding Actions or bus events; "just a small store helper" on the other person's file.
