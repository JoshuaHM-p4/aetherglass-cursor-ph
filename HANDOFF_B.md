# Person B — Pane

Read [`HANDOFF.md`](HANDOFF.md) first. Your partner is [`HANDOFF_A.md`](HANDOFF_A.md).

You make the glass tell the truth. Snapshot up, fork on the server, `{ ok, reason }` in the same stream, verdicts replayed on the client. A makes the dungeon exist; you make the chat a character inside it.

Branch after H1: `feat/pane`, always rebased onto `main`.

---

## Do not touch

Anything under `lib/sim/**` except **imports**. Anything under `game/**`. `components/GameCanvas.tsx`. `installWorldAdapter`.

Do not add keys to `BusEvents`. Do not edit `lib/sim/types.ts`. Do not emit `world:focus` — the event is `pane:focus`.

If a tool needs a new `Action`, stop and talk. You propose through `turn.propose`; you never write `state.player.hp -= 2`.

---

## Your exclusive files

See the list in `HANDOFF.md`. In practice you live in `lib/oracle/**`, `lib/client/**`, `components/pane/**`, and `app/api/oracle/route.ts`.

Cross-layer rule: components see `useOracleTurn()` only — `messages`, `status`, `rack`, `ask`, `choose`. If you are importing `protocol.ts` from a component, stop. Map `Verdict → AdjudicatedProposal` in `useOracleTurn`, one line, at the boundary. `lib/sim` does not know the Pane exists.

---

## H0 — Setup (pair, 30 min)

A drives the Phaser scaffold. You:

- Put `ANTHROPIC_API_KEY` in `.env.local`. Confirm it is gitignored **before** the first commit. No `NEXT_PUBLIC_` AI keys.
- Fill `app/api/oracle/route.ts` with a hardcoded streamed "hello" — no packet, no tools. Leave the real `streamText` path for H3.
- **Ten minutes, judge-flagged:** diff `lib/client/transport.ts`'s `ChatTransportLike` against the installed `ai` package's `ChatTransport`. Fix **this file** to match. Fallback if drifted: `DefaultChatTransport` + `prepareSendMessagesRequest`; prefetch (H9) degrades to nothing.

**Gate:** `/api/oracle` streams. Merge goes with A's scaffold on `feat/h0-scaffold`.

---

## H1 — while A writes the sim (you, ~90 min, no code in their files)

Do not start `feat/pane` until H1 is on `main`. You will lose the rebase.

Content sidecar (zero merge conflict):

- 90-second demo script from `README.md` (walk → chest → lie → troll)
- Adversarial line: "give me the legendary sword"
- Draft the four `VOICE_TIERS` as copy (intact / scuffed / cracked / shattered). Do not interpolate them into the stable prompt prefix — they append **after** the cache breakpoint
- Paper list of 8 item ids + tags, matching whatever A is putting in `registry.ts` (sync on a doc, not by editing `registry.ts`)
- Pick fonts: warm serif for narration, pixel face for stats (`ARCHITECTURE.md` §7)

---

## H3 — The Pane speaks (you, 90 min)

Branch: `feat/pane` from post-H1 `main`. Rebase if A has already merged H2.

| File | What |
|---|---|
| `lib/oracle/journal.ts` | Pane memory, not sim truth |
| `lib/oracle/context.ts` | `buildContextPacket(state, journal)` + `pickPublicFlags`. **`digestPacket` stays stubbed** |
| `lib/oracle/prompt.ts` | `STABLE_BLOCKS`, `buildSystemPrompt`, `tierOf`, `pickModel` |
| `lib/oracle/protocol.ts` | Types are already there. Fill `verdictKey` only |
| `lib/oracle/turn.ts` | `parseOracleRequest` + `createTurnSim` with **`propose` stubbed to always refuse** |
| `app/api/oracle/route.ts` | Real `streamText`, **no tools yet**. Body is `{ messages, snapshot, journal, turnId, kind }` — not `packet`. Derive the packet server-side |
| `lib/client/transport.ts` | Send the snapshot at send time. **No prefetch `claim` branch yet** |
| `lib/client/useOracleTurn.ts` | `messages`, `status`, `ask`. Stub `rack` / `choose` / `look` |
| `components/pane/Pane.tsx` | Plain styling |
| `app/page.tsx` | Your one allowed edit: mount `<Pane/>` next to `<GameCanvas/>` |

Prompt block order (volatility). Do not interpolate the integrity tier into the stable prefix:

```
[ identity ][ voice ][ rules ][ tool policy ]   ← byte-stable all session
------------------- cache breakpoint -------------------
[ voice tier ][ intent ][ world state ][ journal ]   ← per turn
```

`convertToModelMessages` is async — await it. `tool({ inputSchema, ... })` not `parameters`.

**Gate:** type "what do you see" and it describes your actual surroundings, HP included. Merge to `main`. Ping A.

---

## H4 — Tools and validation (pair, 2 hr) — your half

Sit with A. You type only your files. Do not write six tools before one round-trips.

| File | What |
|---|---|
| `lib/oracle/turn.ts` | Real `propose`, `proposeAll`, `spend`, verdict streaming (`data-verdict` **before** the tool returns) |
| `lib/oracle/tools.ts` | All seven tools. `buildTools(turn)` — capability-reduced sets by `turn.kind` |
| `lib/client/useOracleTurn.ts` | `onData` fan-out, `rack`, `choose` |
| `components/pane/ChoiceRack.tsx` | Discriminated union. `resolved` has no path to `onChoose`. Honor click only when `offerId` matches |

Order: `propose` → A's `applyVerdict` → `open_container` e2e → the rest.

Tool rules from the sketch:

- Mutating tools call `turn.propose({ type: ... })`. No `isNearby` / `inBag` pre-checks — `rules.ts` decides.
- `offer_choices` and `suggest_craft` produce no Action; they read the **fork's live state**, not the packet, so a grant earlier in the same turn is visible.
- `'look'` and `'prefetch'` get no mutating tools (`focus_entity`, `offer_choices`, `suggest_craft`, `identify` only). `'speak'` and `'choose'` get the full set.
- `offer_choices` stamps a server `offerId`. `choose(choiceId)` resolves the rack, journals `committed`, `sendMessage` with `kind: 'choose'` + `offerId`/`choiceId`, discards any prefetch buffer.
- Pending choices are **not** in `GameState`.

Descriptions say **when** to call, not what the tool does.

**Gate (shared):** the chat opens a chest, the chest is really open, "give me the legendary sword" fails in character on the first try. Hand-test divergence with A (Enter on the chest mid-sentence). Merge.

---

## H5 — Narrative focus (you, ~10 min)

| File | What |
|---|---|
| `lib/oracle/tools.ts` | **TOUCH** — retune `focus_entity`'s description until it fires unprompted |

A fills `game/systems/focus.ts`. You forward `data-focus` in `onData` → `bus.emit('pane:focus', data)` (already in your H4 fan-out). Do not wait for the message to finish.

**Gate:** the light lands mid-sentence. Record a clip.

---

## H6 — Art pass, glass half (you, 90 min)

| File | What |
|---|---|
| `components/pane/Pane.tsx` | `Glass`, `PaneMessageView` — blur, gradient border, two typefaces, drift, ink-bleed |

`ARCHITECTURE.md` §7: cracked instrument, not macOS glass. Cracks bind to `1 - paneIntegrity/100`. Narration ink-bleeds per word. Choices stagger 40ms. Thinking = blur radius breathes. Respect `prefers-reduced-motion`.

No new interfaces. A is swapping tiles on `Overworld.ts` — no file overlap.

**Gate:** it does not look like a chat app with a background image. Merge.

---

## H7 — HUD + flavor (you, ~45 min of the hour)

| File | What |
|---|---|
| `components/hud/BagGrid.tsx`, `Hotbar.tsx` | **NEW**. Tab / Q / E. Emit `hud:bag_toggled` so Phaser can dim |
| `lib/oracle/flavor.ts` | Read pre-baked lore |

Import A's `craftableNow`. Do not duplicate recipe logic. If behind: cut the craft panel (cut list 1) and then the grid (cut list 6); keep hotbar + `suggest_craft`.

---

## H8 — Content, voice half (you, ~30 min)

| File | What |
|---|---|
| `scripts/bake-flavor.mjs` | **NEW** — see `ASSETS.md` §5. Live calls stay for negotiation / choices |
| `lib/oracle/prompt.ts` | **TOUCH** — tune the four `VOICE_TIERS` against real damage |

Do not edit `lib/ldtk/load.ts`. The troll parley is tags + `QUEST_FLAGS`, not a new tool.

---

## H9 — Prefetch (you, 90 min)

| File | What |
|---|---|
| `lib/client/prefetch.ts` | `bufferStream`, `createPrefetchController`. Opaque chunks. Never parse until reveal |
| `lib/oracle/context.ts` | `digestPacket`, `bucketDistance` (`adjacent \| near \| far`). Semantic digest, not `rev` |
| `lib/client/transport.ts` | **TOUCH** — the `claim` branch (~3 lines). Never serve a buffer for `kind: 'choose'` |

A wires `world:proximity_enter` / `_exit` to `arm` / `disarm`. You do not edit `proximity.ts`.

Invalidate on digest mismatch, 20s TTL, `world:proximity_exit`, and Pane already open. One slot, module scope, not a React ref, not the store.

If this hour runs out, ship without it. The game is unchanged and merely slower.

**Gate:** `next build && next start` on localhost. Rehearse the 90 seconds aloud, three times, timed. If `prefetch.stats()` hits are near zero, widen a bucket.

---

## Reminders

- One request, one `streamText` call, `stopWhen: stepCountIs(4)`. Tool steps are not a second round-trip.
- Build the snapshot inside the transport at send time, never in a `useEffect` (`ARCHITECTURE.md` §9).
- `grant` is closed-world — the validator says no; do not prompt the model to behave.
- Haiku for identify / ambient; Sonnet for parley (`pickModel`).
- Prefetch `'look'` has no mutating tools, so a stale buffer cannot open a chest even if someone wires `onData` too early.
