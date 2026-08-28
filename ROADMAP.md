# Aetherglass — Build order

Sized for a ~12 hour event. Compress by cutting from the bottom, never from the top.

The ordering principle: **the demo path is built first and stays working all day.** Every hour
should end with something you could show, even if it's ugly.

---

## H0 — Setup (30 min)

- `npx create-phaser-game@latest` → Next.js + TypeScript
- Install `ai@^6 @ai-sdk/react@^3 @ai-sdk/anthropic zod zustand motion`
- Drop these docs into `/docs`, `AGENTS.md` at the root
- `.env.local` with the key. Confirm it's gitignored **before** the first commit.
- Verify: Phaser canvas renders, a `/api/oracle` route returns a streamed "hello"

**Gate:** both halves work independently. Don't proceed until they do.

## H1 — The sim, headless (90 min)

- `lib/sim/types.ts` (start from `starter/types.ts`)
- `reducer.ts` with `DAMAGE`, `HEAL`, `GRANT_ITEM`, `OPEN_CONTAINER`, `UNLOCK`, `CRAFT`
- `rules.ts` validators returning typed reason strings
- Zustand store + the EventBus wiring
- A `__tests__/sim.test.ts` with 6 cases, or a scratch page with buttons — either way, prove the
  sim works with zero graphics

**Gate:** you can open a chest and take damage from a test page. No Phaser, no LLM.

## H2 — Movement and combat (90 min)

- Overworld scene, hardcoded tilemap (LDtk comes later)
- Arrow keys, 4-direction facing, collision
- Space to swing, hitbox in facing direction, one slime that dies
- HP display driven by the store

**Gate:** it's a game. Playable with keyboard only. Show someone.

## H3 — The Pane speaks (90 min)

- `/api/oracle` with `streamText`, system prompt, no tools yet
- `<Pane/>` with `useChat`, streaming text, plain styling
- `buildContextPacket` wired into `prepareSendMessagesRequest`
- Type "what do you see" → it describes your actual surroundings

**Gate:** the Pane knows your HP and what's next to you. This is the first real moment.

## H4 — Tools and validation (2 hrs) ← **the core**

- `lib/oracle/tools.ts` (start from `starter/tools.ts`)
- Every tool's `execute` dispatches into the sim and returns `{ ok, reason }`
- `offer_choices` → `<ChoiceRack/>` renders buttons; clicking sends the choice back
- Test the adversarial case: ask for a free legendary sword, confirm it fails in character

**Gate:** the chat opens a chest, the chest is really open, and lying to it doesn't work.

## H5 — Narrative focus (60 min)

- `focus_entity` tool → `data-focus` part → `onData` → EventBus → `game/systems/focus.ts`
- Dim layer, spotlight sprite, camera pan
- Tune the timing until the light lands mid-sentence

**Gate:** the signature effect works. Record a clip now as insurance.

## H6 — Art pass (90 min)

- Drop in the asset pack, swap grey boxes for tiles and sprites
- Player walk animation
- The Pane's glass treatment: backdrop blur, gradient border, the two typefaces, the drift
- Torch flicker on the camera

**Gate:** it's photogenic. This hour is when the project starts looking fundable.

## H7 — Inventory and crafting (90 min)

- Tab → bag grid, hotbar with Q/E
- 6 recipes, craft from the grid
- `suggest_craft` read-only tool
- `identify` tool with pre-baked lore from `flavor.json`

## H8 — Content (60 min)

- Build the real level in LDtk with proper entity fields
- Run `scripts/bake-flavor.mjs`
- The troll parley encounter
- The Pane's integrity system: crack overlay + degraded prompt below 30%

## H9 — Polish and rehearse (90 min)

- Sound: footsteps, swing, chest, the Pane waking
- Prefetch-on-proximity
- Title card: game name, one-line pitch, "arrow keys to move"
- `next build && next start` — demo from a local production build, never dev, never wifi
- **Rehearse the 90 seconds out loud, three times.** Time it.

---

## Cut list (in cutting order)

Cross these off without guilt:

1. Crafting UI → keep `suggest_craft`, cut the grid
2. Sound
3. The Pane integrity / crack system
4. Multiple enemy types
5. LDtk → keep the hardcoded map
6. Inventory grid → hotbar only

**Never cut:** the sim validators, the focus effect, the adversarial "ask it to cheat" beat.
Those three are the entire pitch.

---

## Judging notes

Things worth saying out loud when you present:

- "The model never holds game state — it proposes, and a deterministic reducer disposes." This
  answers the reliability question before it's asked.
- "Items carry semantic tags, not scripted interactions. Adding a crowbar gives every sealed
  object in the game a new solution, with no new code." This answers the scalability question.
- "The narration and the world are the same stream." This answers *why does this need to be a game*.

And then let someone else hold the keyboard. A judge playing it for thirty seconds beats any
amount of explaining.
