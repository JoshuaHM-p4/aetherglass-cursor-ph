# Aetherglass — Making the resources

The rule for a build event: **draw nothing until the game works.** Art is the most fun and the
least load-bearing thing you can do at hour two, and it is where hackathon teams go to die.
Grey boxes until the Pane can open a chest.

---

## 1. Decide the grid first

Everything downstream depends on this. Pick now, don't change it.

- **Tile size:** 16×16 px
- **Internal resolution:** 480×270 (30×17 tiles) — 16:9, scales cleanly to 1920×1080 at 4×
- **Character sprite:** 16×16 body in a 16×24 frame (head clears the tile above — reads better
  on a top-down grid)
- **Palette:** pick one and hold it. [Lospec](https://lospec.com/palette-list) has thousands;
  *Apollo* (46 colours) or *Resurrect 64* both suit a torchlit keep. A fixed palette is what
  makes assets from three different packs look like one game.

---

## 2. Art: use a pack (do this)

Free, permissive, top-down RPG kits. **Read the LICENSE file in each download** — terms change
and some packs distinguish free from commercial use.

| Source | What you get | Notes |
|---|---|---|
| **Ninja Adventure Asset Pack** (Pixel-Boy, itch.io) | Complete top-down kit — tiles, characters, enemies, items, UI, music, SFX | The single best pick for this project. Enormous and coherent. Released as CC0 at time of writing. |
| **Kenney** (kenney.nl) | Roguelike/RPG packs, Tiny Dungeon, UI packs, audio | CC0. Cleanest licensing on the internet. Style is chunkier than the above — don't mix them. |
| **Tiny Swords** (Pixel Frog, itch.io) | Characters, terrain, props | Free. Larger, more cartoon-y proportions. |
| **OpenGameArt / LPC collection** | Huge sprite library | Mostly CC-BY-SA or GPL — **attribution required**, and share-alike can be sticky. Read carefully. |
| **itch.io → Game assets → free → tag:16x16** | Everything else | Filter by license before downloading. |

Pick **one** primary pack. Fill gaps from a second only if the palette is close. Three packs
looks like a hackathon; one pack plus your own two sprites looks like a game.

### What you'll actually need

```
tiles/    dungeon floor, wall, wall-top, door, stairs, rubble    (~20 tiles)
props/    chest closed/open, lockbox, brazier, shrine, barrel     (~8)
chars/    player 4-dir walk (4 frames each), 1 slime, 1 troll     (~3 sheets)
items/    crowbar, sword, key, mushroom, ore, potion, pane-shard  (~8 icons, 16x16)
fx/       sword slash, hit spark, spotlight cone, dust            (~4)
ui/       heart full/half/empty, slot frame, crack overlay        (~6)
```

That's the whole game. Roughly 50 sprites, nearly all of which exist in the pack already.

---

## 3. Tools

| Job | Tool | Cost |
|---|---|---|
| Level design | **LDtk** | Free. Use this — its entity custom fields feed the LLM directly (§4). |
| Level design (alt) | Tiled | Free. More Phaser examples exist, fewer nice features. |
| Sprite editing | **Aseprite** (~$20) / **LibreSprite** (free fork) / **Piskel** (free, browser) | Piskel is fine for the 4 sprites you'll actually touch. |
| Spritesheet packing | free-tex-packer.com | Free, browser, exports Phaser JSON atlas. |
| Palette matching | Aseprite's *Color > Palette from file* | Force everything through your Lospec palette. |
| SFX | **jsfxr** / ChipTone (browser) | Free. Retro blips in 10 seconds. |
| Music | Ninja Adventure pack includes tracks; incompetech.com; Kenney audio | Check attribution terms. |
| Fonts | Google Fonts: *Silkscreen*, *Pixelify Sans*, *Press Start 2P*; *m6x11* by Daniel Linssen (free) | Pair one pixel face with one serif — see ARCHITECTURE §7. |

---

## 4. LDtk → sim → Pane (the pipeline that matters)

This is where a level editor stops being a level editor and becomes your content authoring
tool for the LLM. In LDtk, define an Entity called `Interactable` with custom fields:

| Field | Type | Example | Who reads it |
|---|---|---|---|
| `kind` | enum | `container` / `door` / `shrine` / `elite` | sim + Pane |
| `name` | string | `rusted lockbox` | Pane |
| `tags` | array<string> | `["sealed","iron","runed"]` | Pane (this is the reasoning surface) |
| `locked` | bool | `true` | sim validators |
| `contents` | array<string> | `["crowbar","ore_iron"]` | sim (the only ids `grant` may produce) |
| `paneWorthy` | bool | `true` | triggers auto-wake + prefetch |
| `seed` | string | `a cold draft comes from the seam` | Pane, as a first-look hint |

Then one loader does everything:

```ts
// lib/ldtk/load.ts
export function loadLevel(json: LdtkJson) {
  const entities = json.levels[0].layerInstances
    .find(l => l.__identifier === 'Entities')!.entityInstances
    .map(e => ({
      id: e.iid,                                  // <-- same id everywhere. critical.
      kind: field(e, 'kind'),
      name: field(e, 'name'),
      tags: field(e, 'tags') ?? [],
      locked: field(e, 'locked') ?? false,
      contents: field(e, 'contents') ?? [],
      paneWorthy: field(e, 'paneWorthy') ?? false,
      seed: field(e, 'seed'),
      state: 'idle' as const,
      tx: Math.floor(e.px[0] / 16), ty: Math.floor(e.px[1] / 16),
    }));
  return { entities, tilemap: json.levels[0] };
}
```

**The `iid` is the same id used by the sim, by Phaser's `sprite.name`, and by the Pane's
`focus_entity` tool.** One id space, no translation layer. Get this right on the first pass or
you'll spend an hour debugging spotlights that land on the wrong barrel.

Now placing a new chest in LDtk automatically gives the Pane something new to talk about, with
no code change. That's your content pipeline.

---

## 5. Using your API keys for content, not pixels

You have keys — spend them where LLMs are actually good.

**Bad idea: generating tilesets.** Image models can't produce seamless 16×16 tiles that align
to a grid, and you'll lose two hours discovering this. Skip it.

**Good idea: generating text at build time.** Write a script that pre-bakes every static string
in the game into `public/assets/flavor.json`:

```bash
node scripts/bake-flavor.mjs   # runs once, commits the output
```

```js
// scripts/bake-flavor.mjs  (sketch)
const targets = [
  ...items.map(i => ({ key: `item.${i.id}`, prompt: `A terse, slightly condescending
     one-sentence description of "${i.name}" (tags: ${i.tags}) as read aloud by an ancient
     cracked pane of enchanted glass. Under 20 words.` })),
  ...entities.map(e => ({ key: `look.${e.id}`, prompt: `...first impression of ${e.name}...` })),
];
// call the model once per target, write { key: text } to flavor.json
```

Why this is worth doing:

- **Speed.** Zero latency on the most frequent interactions.
- **Cost.** Your demo loop stops burning tokens on the same chest description forty times.
- **Consistency.** You read them, cut the bad ones, and the Pane's voice is locked in before
  the judges see it.
- **Offline insurance.** If the venue wifi dies, 80% of the game still talks.

Live calls stay for what deserves them: choices, negotiation, consequences, and anything that
depends on your current inventory.

**Also good:** generating a small library of item names, recipes, and enemy taunts as JSON to
seed the sim. And single item icons on flat backgrounds (then background-remove and downsample
to 16×16) — icons survive AI generation far better than tiles, since seams don't matter.

---

## 6. Audio, briefly

Four sounds carry the whole feel. Do these and stop:

1. Footstep on stone (two variants, pitch-randomised ±10%)
2. Sword swing (whoosh) + hit (thud)
3. Chest creak
4. The Pane waking — a soft glass-ring with reverb. This one is the mood; spend the extra
   five minutes on it.

One ambient loop (low drone) at 20% volume under everything. Phaser handles pitch variance:
`scene.sound.play('step', { rate: 0.9 + Math.random() * 0.2 })`.

---

## 7. Priority order

If you only get through part of this list, get through it in this order:

1. Grey boxes and a working sim
2. Tileset + player sprite from the pack (game now looks real)
3. The Pane's glass treatment + typography (this is what gets photographed)
4. The spotlight / focus effect
5. Enemy and prop sprites
6. Sound
7. The crack overlay on the Pane
8. Anything you draw yourself
