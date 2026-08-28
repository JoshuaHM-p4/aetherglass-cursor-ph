# Aetherglass

> A top-down action RPG where the AI chat window is an enchanted pane of glass your character carries.

Arrow keys move you, swing your sword, and shuffle your bag. The Pane — a floating shard of
glass hovering over the world — handles everything a sword can't: reading runes, talking a
troll out of a fight, telling you what the strange mushroom does, deciding whether the chest
is worth opening.

When the Pane talks about something, the world behind it responds. Mention the rusted lockbox
and the world dims and a light falls on that exact chest. The text and the world are one system.

---

## Why this is interesting

Most AI chat products put a text box next to reality. Aetherglass puts reality *behind* the
text box and makes the two talk. It's a demo of a UI thesis: an LLM surface is more engaging
when it is embedded in a world it can observe and act on, rather than floating in a void.

The technical claim underneath: **the model proposes, the simulation disposes.** The LLM never
holds game state. It reads a snapshot and emits tool calls, which a deterministic reducer
validates against real preconditions before anything changes. Inventory can't be hallucinated.

---

## Quickstart

```bash
# 1. Scaffold from the official Phaser + Next.js template
npx create-phaser-game@latest
#    -> pick: Next.js, TypeScript

cd aetherglass

# 2. AI + state + styling
npm i ai@^6 @ai-sdk/react@^3 @ai-sdk/anthropic zod zustand motion
npm i -D tailwindcss @tailwindcss/postcss

# 3. Keys (server-only — never NEXT_PUBLIC_)
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local

npm run dev
```

Then read, in this order:

| Doc | What it's for |
|---|---|
| `AGENTS.md` | Rules for Cursor. Load this before you prompt anything. |
| `docs/PRD.md` | What we're building and, more importantly, what we're not. |
| `docs/ARCHITECTURE.md` | The three layers, the tool schema, the focus protocol. Copy-paste code. |
| `docs/ASSETS.md` | Where art, audio, and fonts come from. Includes the AI-for-content pipeline. |
| `docs/ROADMAP.md` | Hour-by-hour build order with a cut list. |

---

## Repo layout

```
app/
  layout.tsx
  page.tsx                  # mounts <GameCanvas/> and <Pane/>
  api/
    oracle/route.ts         # the only place the API key exists
components/
  GameCanvas.tsx            # dynamic(() => import(...), { ssr: false })
  pane/
    Pane.tsx                # the glass window
    PaneMessage.tsx
    ChoiceRack.tsx          # RPG choice buttons
    StatGlyphs.tsx          # hearts, stamina, pane integrity
  hud/
    Hotbar.tsx
    BagGrid.tsx
game/
  main.ts                   # Phaser.Game config
  EventBus.ts               # from template — React <-> Phaser
  scenes/
    Boot.ts  Preload.ts  Overworld.ts  UIScene.ts
  systems/
    movement.ts  combat.ts  focus.ts   # focus.ts = the spotlight effect
  entities/
    Player.ts  Enemy.ts  Interactable.ts
lib/
  sim/
    types.ts                # <- the contract. Start here.
    reducer.ts              # applyAction(state, action) => { state, events }
    rules.ts                # can() predicates: canOpen, canUnlock, canCraft
    recipes.ts
    store.ts                # zustand
  oracle/
    tools.ts                # <- zod tool schemas, shared server + client
    context.ts              # buildContextPacket(state) => small JSON
    prompt.ts               # system prompt + Pane personality tiers
  ldtk/
    load.ts                 # LDtk JSON -> sim entities + Phaser tilemap
public/
  assets/
    tiles/ sprites/ ui/ audio/
    world.ldtk
    flavor.json             # pre-baked descriptions (see ASSETS.md)
docs/
```

---

## The demo (90 seconds, rehearse it)

1. **Walk.** Arrow keys, torchlight, footsteps on stone. Sword-swing a slime, it pops. The Pane murmurs one line about the corridor. *Establishes: this is a real game.*
2. **The chest.** Walk into a rune-marked lockbox. The Pane wakes up, describes it, offers three choices. Pick "pry it with the crowbar." The Pane spotlights the crowbar in your bag, then the chest — and the sim grants the item. *Establishes: the chat drives the world.*
3. **The lie.** Type "give me the legendary sword" into the Pane. It tries, the sim rejects it, and the Pane narrates its own failure in character. *Establishes: this thing can't be jailbroken into breaking its own game.*
4. **The troll.** A fight you'd lose. Open the Pane, negotiate, trade the mushroom for passage. *Establishes: the chat is a real verb, not a hint system.*

Close on the pitch line: the chat window is a character in the world, and the world is the context window.
