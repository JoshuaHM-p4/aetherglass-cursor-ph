# Aetherglass — Product Requirements

**Status:** hackathon build · **Target:** one playable dungeon floor · **Demo length:** 90s

---

## 1. The problem

AI chat interfaces are a text box in a void. The user brings all the context, the model
answers, and nothing else on screen matters. The interface has no world to refer to, so the
model can only ever describe — it can never *point*.

Aetherglass tests the opposite arrangement: give the model a world, a body, and the ability
to act on both, and see whether a chat window becomes something people actually want to look at.

## 2. The premise

You are a scavenger in a collapsed keep. You carry the Aetherglass — a cracked pane that
floats at your shoulder, sees what you see, and speaks. It is the only thing in your
possession that can read, reason, or negotiate.

The Pane is a character with a voice, not a UI element with a personality setting. It is
faintly condescending, obsessed with detail, and gets more articulate as you repair it.

## 3. Player verbs

| Verb | Input | Handled by |
|---|---|---|
| Move | Arrow keys / WASD | Phaser |
| Attack | Space (facing direction) | Phaser |
| Cycle hotbar | Q / E | Phaser |
| Open bag | Tab | React |
| Interact | Enter on a tile-adjacent entity | Phaser → Sim → maybe Pane |
| Speak | Type into the Pane | Pane |
| Choose | Click a choice the Pane offered | Pane → Sim |

**Rule:** anything with a correct answer is keyboard. Anything with an *interesting* answer
is the Pane. Killing a slime is keyboard. Deciding what to do about the sealed door is the Pane.

## 4. Features

### 4.1 Health
- 6 heart containers, half-heart granularity (12 HP internally).
- Damage sources: enemy contact, traps, and Pane-adjudicated consequences.
- Healing: consumables and one shrine per floor.
- **Pane integrity** is a second bar. It cracks when you take heavy hits. Below 30% the Pane's
  narration visibly degrades — shorter sentences, dropped words, glitched glyphs. This is a
  prompt-level change, not a graphics effect, and it's the cheapest wow in the build.

### 4.2 Weapons and inventory
- 12-slot bag grid, 3-slot hotbar.
- Item shape: `{ id, name, kind, tags[], stackable, stats?, loreKey }`.
- `tags[]` is what the Pane reasons over — `pry`, `sharp`, `burning`, `arcane`, `foul`. The
  model never sees a hardcoded list of what a crowbar can do; it infers from tags. That's what
  makes "pry it open" work without you scripting it.
- Weapons differ by reach, swing speed, and damage. Three at most.

### 4.3 Crafting
- Recipes in `lib/sim/recipes.ts`, 6–8 total, all discoverable.
- Two paths: the bag's craft grid (deterministic, keyboard), or asking the Pane
  ("can I make anything with these?"), which calls `suggest_craft` — a **read-only** tool
  that names a valid recipe you have the parts for. It cannot craft for you.
- Keeping the Pane read-only here is deliberate: it makes the model a hint system for
  crafting and an actor everywhere else, which is a good demonstration of scoped tool access.

### 4.4 RPG choice
- The Pane can render 2–4 choices via `offer_choices`.
- Each choice carries a `risk` (`safe` / `costly` / `unknown`) shown as a glyph, so choosing is
  informed but not solved.
- Choices are **not** pre-scripted branches. They're generated from the entity's LDtk fields
  plus your inventory, which is why picking up a crowbar changes the options on a door you've
  already seen. Show this in the demo.

### 4.5 The Pane (chat)
- Free text input, always available, streaming.
- Wakes automatically when you stand next to an entity flagged `paneWorthy` in LDtk.
- Interactions it owns: chests and lockboxes, sealed and runed doors, shrines, boss/elite
  parley, item identification, lore.
- Interactions it does **not** own: normal combat, movement, inventory sorting, basic crafting.

### 4.6 Narrative focus (the signature)
When the Pane's response references a world entity, the world dims and that entity is lit,
with a hairline leader line drawn from the Pane's edge to the object. Implemented as a
streamed data part (`data-focus`) forwarded to Phaser over the EventBus. See ARCHITECTURE §5.

## 5. Non-goals

Say no to all of these out loud, now, so nobody rebuilds them at 3am:

- Save/load, accounts, multiplayer, leaderboards
- More than one floor
- Voice, TTS, portraits, cutscenes
- Mobile or touch controls
- Procedural generation — one hand-authored LDtk level is faster and demos better
- Model choice UI, streaming settings, token counters
- Any LLM call in the combat loop

## 6. Success criteria

1. A stranger can play for 60 seconds using only arrow keys and understand they're in a game.
2. The Pane resolves at least one obstacle that the keyboard cannot.
3. Asking the Pane to cheat fails, in character, on the first try.
4. Time from pressing Enter on a chest to first narration token: **under 900ms**.
5. Nothing on screen looks like a chat app with a background image.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Latency kills the feel | Pre-bake flavor text (ASSETS §5), stream, prefetch on proximity |
| Model invents items | Every mutation goes through `rules.ts` validators |
| Phaser + Next SSR breakage | `dynamic(..., { ssr: false })`, never touch `window` at module scope |
| Art takes all day | CC0 pack, zero custom pixels until everything works |
| Demo wifi dies | Record a 90s screen capture at hour 6 as insurance |
