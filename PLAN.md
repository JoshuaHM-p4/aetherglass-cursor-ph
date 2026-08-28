# Aetherglass — the Plan

The synthesized design package: rationale, module sketch map, and build order. The sketch
files it describes live at their real paths (`lib/`, `game/`, `components/`, `app/`) with
`not implemented` bodies — Phase D fills them in per the build order at the bottom of this
file. Produced by a four-candidate design arena; see the Synthesis decision section for
what was picked, grafted, and rejected.

## Problem

We are building a top-down action RPG in which an LLM chat pane is a character inside the
world: it narrates, it spotlights objects in the Phaser canvas mid-sentence, it offers
choices, and it proposes state changes that a deterministic reducer validates and may
refuse. Four doc constraints make the shape non-obvious, and they pull against each other.
(1) `AGENTS.md` says the LLM never mutates state and every mutation flows through
`applyAction` in `lib/sim/reducer.ts`; (2) the AI SDK runs tool `execute` **server-side**
inside `app/api/oracle/route.ts`, while `README.md` puts `GameState` in a **client-side**
Zustand store; (3) `ARCHITECTURE.md` requires the model to receive `{ ok, reason }` and
narrate the refusal in its *next sentence of the same stream*; (4) `AGENTS.md` forbids a
second LLM round-trip per turn. Those four cannot all be satisfied by any design that
tries to dispatch across the network mid-stream — which is precisely what the starter
`tools.ts` implies with its closed-over `Dispatch`. Something has to give, and choosing
what gives is the load-bearing decision of this design.

---

## Usage (caller's view)

### Quickstart

```bash
npx create-phaser-game@latest        # Next.js + TypeScript
npm i ai@^6 @ai-sdk/react@^3 @ai-sdk/anthropic zod zustand motion
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local
npm run dev
```

Three things to know before you write a line:

1. **The sim is the only writer.** `applyAction(state, action)` is the single mutation
   point. It runs in two places — the client store (the commit) and a throwaway
   server-side fork (a dry run so the model can be told the truth). Same function, same
   file, imported by both.
2. **The Pane's whole API is one hook.** `useOracleTurn()`. It hides the transport, the
   context packet, verdict replay, prefetch, and the choice round-trip. If you find
   yourself importing `protocol.ts` from a component, stop.
3. **Facts come from the store; moments come from the bus.** Phaser subscribes to
   `gameStore` for anything with a duration (hp, entity state) and listens on the
   `EventBus` for anything instantaneous (a hit spark, a spotlight).

### Call site 1 — the Pane component (the entire consumer surface)

```tsx
// components/pane/Pane.tsx
const { messages, status, rack, ask, choose } = useOracleTurn();
const integrity = useGame(s => s.state.player.paneIntegrity);

return (
  <Glass integrity={integrity} status={status}>
    {messages.map(m => <PaneMessageView key={m.id} {...m} />)}
    {rack && <ChoiceRack rack={rack} onChoose={choose} />}
    <PaneInput disabled={status === 'thinking'} onSubmit={ask} />
  </Glass>
);
```

No packet, no `GameState`, no `data-*`, no `fetch`, no awareness that prefetch exists.

### Call site 2 — a mutating tool, server-side

```ts
// lib/oracle/tools.ts
open_container: tool({
  description: 'Open a chest, lockbox, or barrel the player is adjacent to. …',
  inputSchema: z.object({ entityId: z.string() }),
  execute: async ({ entityId }) => turn.propose({ type: 'OPEN_CONTAINER', entityId }),
}),
```

`turn.propose` runs the real reducer against the request-local fork, streams a
`data-verdict` part to the client *before returning*, and hands the model
`{ ok: false, reason: 'locked' }` synchronously. The model's next sentence is already
true. No network hop, no second model invocation, no client involvement.

### Call site 3 — a swing of the sword (the 60fps path)

```ts
// game/systems/combat.ts   — Phaser owns geometry
bus.emit('world:attack_landed', { entityId, facing, withItemId });

// game/EventBus.ts          — the adapter owns translation
bus.on('world:attack_landed', ({ entityId, withItemId }) =>
  gameStore.getState().dispatch(
    { type: 'STRIKE_ENTITY', entityId, amount: weaponDamage(withItemId), withItemId },
    'keyboard',
  ));

// game/systems/combat.ts   — Phaser reacts to the moment
bus.on('sim:event', e => { if (e.type === 'entity_struck') spark(e.entityId); });
```

Three files, no LLM, no store copy of enemy hp.

### Call site 4 — the player clicks a choice

```ts
choose('pry_it');
// -> rack becomes { status: 'resolved', chosenId: 'pry_it' }   (second click impossible)
// -> journal gains "the player committed to: pry it with the crowbar (costly, uses crowbar)"
// -> sendMessage({ text: 'pry it with the crowbar' }, { body: { kind: 'choose', choiceId } })
// -> prefetch buffer discarded (it predates the commitment)
```

---

## Shape

### Data structures, and the access patterns that justify them

`types.ts` is treated as near-final and its structures are right. What matters is naming
the dominant access pattern for each, because that is what stops someone adding an index
at hour 7:

| Structure | Dominant pattern | Verdict |
|---|---|---|
| `entities: Record<string, Entity>` | lookup by id — every guard, every verdict replay, every `focus_entity` | O(1), correct as authored |
| `bag: Item[]` | membership by id (≤12 entries) **and** ordered render as a 12-slot grid | the array *is* the render model; an id index would be a second source of truth for membership needing sync on every grant. **No index, ever.** |
| nearest-8 scan | once **per Pane turn**, never per frame | linear over ~30 entities. Phaser's proximity uses arcade overlap sensors, so the physics engine is the spatial index and `lib/sim` owns no geometry structures |
| `log: string[]` | append + tail(5) | ring capped at 20 in the reducer |
| verdict replay | ordered, at-most-once per `${turnId}:${seq}` | a `Set<string>` of applied keys in the store |

Three new structures carry the design: `TurnSim` (the server-side fork), `Verdict` (the
wire form of "the simulation disposed"), and `PaneJournal` (the Pane's own memory,
separate from sim truth).

### Open question 1 — the proposal/application loop

**Decision: ship the snapshot up, fork the sim inside the request, stream verdicts down,
replay them on the client.**

```
client                              server (ONE request, ONE streamText call)
------                              ----------------------------------------
snapshot = world()          ──▶     fork   = createTurnSim({ snapshot, journal })
messages, journal                   packet = buildContextPacket(fork.state, journal)
                                    streamText({ system, tools: buildTools(fork),
                                                 stopWhen: stepCountIs(4) })
                                      tool execute
                                        applyAction(fork, action)      ← synchronous
                                        writer.write({ data-verdict }) ← streams NOW
                                        return { ok, reason }          ← model reads it
onData: applyVerdict(v)     ◀──     text and parts interleaved on one stream
  -> gameStore commit
```

Four properties fall out of this and they are the reason it wins:

- **Truthful tool results at zero latency.** The `{ ok, reason }` the model narrates comes
  from the actual reducer running against actual state, in-process, in the same microtask.
- **One network leg, one prefill.** Both alternatives (client applies via `onToolCall`;
  server proposes and client echoes) require a second POST with a full context re-upload
  in the middle of a sentence, inside a 900ms budget.
- **The client store stays the single source of truth.** The fork is explicitly a *dry
  run*: it is garbage-collected with the request, nothing reads it but the model, and if
  the process died mid-turn the world would simply not have changed.
- **The verdict stream is a commit log, so the world moves mid-sentence.** The client is
  applying `OPEN_CONTAINER` while the model is still composing the clause about it — the
  same trick as the spotlight, applied to state.

**On "no second LLM round-trip per turn":** a tool-continuation *step* inside one
`streamText` call is not a round trip. `stopWhen: stepCountIs(4)` keeps the entire turn
inside one HTTP response and one continuous UI message stream, and because the system
prefix is byte-stable (below), steps 2+ are prompt-cache hits. What the rule forbids is a
second *request cycle* per turn, which is exactly what the two rejected options cost.

**Consistency.** The only way the client's commit can disagree with the fork's dry run is
if the player did something with the keyboard between snapshot and reveal.
`applyVerdict` therefore re-runs `check(state, action)` against live state before
committing, and yields one of four outcomes — `applied`, `duplicate`, `refused`,
`diverged`. On `diverged` the action is **dropped** and a line goes into the journal
("the world moved: the lockbox was already open by the time I finished speaking"), so the
Pane's next packet contains the correction and it recovers in character. State never
forks; only the narration can be briefly wrong, and a fallible Pane reads as
characterisation rather than as a bug. That is the consistency model stated in one
sentence: **the world is never wrong, and the Pane occasionally is.**

**Idempotency.** Keyboard actions are user intent and *should* apply twice if pressed
twice. Pane actions are a replay of a decision already made and must not, so every verdict
carries `${turnId}:${seq}` and the store applies each key at most once. This is what makes
React strict-mode double-invocation and a re-revealed prefetch buffer harmless.

### Open question 2 — the EventBus contract

Two rules decide every membership question, which is why the vocabulary is 14 events and
not 40:

1. **The bus carries moments; the store carries facts.** Duration → read `gameStore`
   (vanilla zustand, so Phaser can subscribe without importing React). Instant → emit.
   Hence no `sim:hp_changed`; hence `sim:event`.
2. **Namespace by producer, not by topic.** `sim:` only from the store, `world:` only from
   Phaser, `pane:` only from React, `hud:` only from the HUD. One producer per channel
   means a listener knows who to blame, and it structurally prevents the two-writers
   problem from reappearing on the bus after we were careful about it in the store.

| Direction | Events |
|---|---|
| sim → world | `sim:event`, `sim:desync`, `sim:hydrated` |
| world → sim/React | `world:ready`, `world:tile_entered`, `world:attack_landed`, `world:player_hurt`, `world:interact`, `world:interact_clear`, `world:proximity_enter`, `world:proximity_exit` |
| pane → world | `pane:focus`, `pane:focus_clear`, `pane:awake`, `pane:thinking` |
| hud → world | `hud:bag_toggled` |

Payload types are in `game/EventBus.ts` as a `BusEvents` interface; `emit`/`on` are generic
over it, so a misspelled event name is a compile error rather than an event that silently
never fires. Entity references are always `entityId`, always the LDtk `iid`.

This renames `ARCHITECTURE.md` §5's `world:focus` to `pane:focus` — the one deliberate
divergence from the doc's copy-paste code. Under producer-namespacing, `world:` for a
React-produced event would be a lie.

`installWorldAdapter()` is the single place Phaser's vocabulary becomes Actions. It lives
outside any scene, because scenes restart and a restarted scene must not register a second
dispatcher.

### Open question 3 — the choice round-trip

`offer_choices` → `data-choices` (now carrying a server-stamped `offerId`, grafted from
candidate 2) → `rack` state inside `useOracleTurn` → `<ChoiceRack>`. Clicking calls
`choose(choiceId)`, which does four things in order: resolve the rack (honored only when
the click's offerId matches the current rack's), record a `committed` journal entry,
`sendMessage` with the label as the visible player bubble and `kind: 'choose'` +
`offerId`/`choiceId` in the body, and discard any prefetch buffer.

Three decisions inside that:

- **Pending choices are not in `GameState`.** `GameState.ui` holds `paneOpen` because
  whether the glass is lit is a fact Phaser dims for; which buttons are on screen is a
  fact about one chat turn. Putting them in the sim would make sim truth depend on what
  the LLM said, inverting the architecture.
- **Idempotency is a type.** `ChoiceRack` is a discriminated union and the `resolved`
  branch has no path to `onChoose`. There is no `hasChosen` boolean to forget to set.
- **"This is a decision, not a suggestion" is a server-side prompt block** selected by
  `kind`, not a sentence smuggled into the user's message text. The label the player sees
  and the instruction the model gets are separate concerns.

Consequences arrive as ordinary verdicts on the next response. Buttons get no second write
path into the world.

### Open question 4 — prefetch-on-proximity

**Prefetch at the transport layer, buffering opaque chunks.** The buffered stream is not
"merged with `useChat`" — it is *handed to* `useChat` as the response to a send that hasn't
happened yet. `createOracleTransport` implements `sendMessages`; on send it asks
`PrefetchController.claim(digest)` and returns `buffer.replay()` on a hit, which flushes
every chunk received so far and then follows the live source.

- **Where it lives:** module scope, one slot, outside React. Not a ref (dies with the
  component), not the store (that is sim truth). One slot because there is one player.
- **Why side effects don't leak early:** two structural gates, belt and braces. The buffer
  holds opaque chunks and never parses them, so `onData` — and therefore `applyVerdict`,
  `pane:focus`, the rack — cannot run until `useChat` consumes the stream at reveal. And
  (grafted from candidate 2) 'prefetch'/'look' turns are built with no mutating tools at
  all, so a buffered stream cannot even *contain* a mutating verdict — a look describes
  and offers; consequences land on the 'choose' turn, which is never served from a buffer.
- **What invalidates:** `digestPacket` mismatch, a 20s TTL, `world:proximity_exit`, and
  the Pane already being open. The digest is **semantic**, not `rev`: it hashes nearby
  ids/states/tags with distances *bucketed* to `adjacent | near | far`, inventory
  ids+qty, hp bucket, and integrity **tier**. So walking two tiles closer does not
  invalidate a buffer, but picking up the crowbar does — which is exactly the PRD §4.4
  beat. `rev` would have been too strict: it bumps on every `MOVE`, killing the buffer
  during the walk toward the very chest it was generated for.

### Open question 5 — the rules layer shape

One guard per Action type in a total table:

```ts
type Guards = { [K in Action['type']]: Guard<Extract<Action, { type: K }>> };
export function check(state: GameState, action: Action): CheckResult;
```

`Guards` being a mapped type over the Action union means **a new Action is a compile error
until it has a guard** — the invariant "no unguarded mutation" expressed as a type instead
of a code review. `applyAction` is `check` then commit, with no conditionals below the
check.

The reducer and the tool layer share the rules by not sharing them: they share the
*reducer*. Tools call `turn.propose` → `applyAction` → `check`. There is no second path
into the world, so there is nothing to keep in sync. Consequently the starter's
`isNearby` / `inBag` pre-checks are **deleted** from the mutating tools — they were a
second implementation of `not_nearby` and `not_in_bag` reading a *projection* of state
(the packet) rather than state, and projections drift. They survive only in
`offer_choices` and `suggest_craft`, which produce no Action and therefore have no guard to
defer to, and even those read the fork's live state so that a grant earlier in the same
turn makes a new choice legal immediately.

### Open question 6 — Pane integrity degradation

The system prompt is an **ordered list of blocks** and the ordering rule is **volatility**:

```
[ identity ][ voice ][ rules ][ tool policy ]   ← byte-stable for the whole session
------------------- cache breakpoint -------------------
[ voice tier ][ intent ][ world state ][ journal ]   ← per turn
```

Tiers are data (`VOICE_TIERS`, four entries, selected by `tierOf(integrity)`) and their
directives are **appended after the breakpoint, not interpolated**. This is the
load-bearing reason for the block model: the starter interpolates `cracked` in the middle
of the voice section, so crossing 30% integrity changes the cacheable prefix and discards
the cache — including between tool-continuation steps of the same turn.

`paneIntegrity` has three consumers and no synchronisation: the crack overlay reads
`1 - integrity/100`, the prompt reads `tierOf(integrity)`, and the prefetch digest reads
the tier id so a buffer is invalidated exactly when the voice would have changed. One
integer, derived three ways.

### Interface depth, judged

- **Deep, and worth it:** `useOracleTurn()` — six members hiding transport, packet
  building, snapshot serialisation, verdict replay, journal, prefetch buffering, choice
  round-trip, and bus forwarding. `Pane.tsx` imports two things from `lib/`.
  `TurnSim` — four methods hiding the fork, the reducer, verdict streaming, and per-turn
  budgets. `check()` — one function hiding the entire rulebook.
- **Shallow, and deliberately so:** `components/useGame.ts` is four lines. It is a separate
  file so the *import graph* enforces "no react in lib/sim" rather than a reviewer.
  `route.ts` is thin because every decision it appears to make lives somewhere testable.
- **No transport types on public surfaces:** `protocol.ts` is imported only by `lib/oracle`,
  `lib/client`, and `app/api/oracle`. Components see `PaneMessage`, `ChoiceRack`,
  `PaneStatus`. `lib/sim` imports from `lib/oracle` nowhere — `applyVerdict` takes an
  `AdjudicatedProposal` declared in `store.ts`, and `useOracleTurn` does the one-line
  `Verdict → AdjudicatedProposal` map at the boundary. The sim is the bottom of the stack
  and does not know the Pane exists.
- **Call chains ≤3 files:** chest opens = `tools.ts` → `turn.ts` → `reducer.ts`. Sword
  swings = `combat.ts` → `EventBus.ts` → `reducer.ts`. Spotlight lands = `tools.ts` →
  `useOracleTurn.ts` → `focus.ts`.

### What the system deliberately does not do

No auth, persistence, database, or multiplayer. No server-held session — the fork cannot
outlive its request, by construction. No id mapping layer. No LLM call in movement or
combat. No fourth layer. No safety prompt asking the model not to cheat; a validator
instead. No index on the bag. No `GameState` in React state. No props on `GameCanvas`.

### Deltas to the near-final contract

Four additions to `types.ts`, each because a module could not be written without it:
`STRIKE_ENTITY` (otherwise Phaser must keep its own enemy hp, which `ARCHITECTURE.md`
§1.3 forbids by name); `entity_struck` (a hit spark is a distinct moment from the player
being damaged); `wrong_kind` (`ARCHITECTURE.md` §2's own sample reducer returns
`no_such_container`, which is not in the `RejectReason` union); `ActionOrigin` (attribution
for the two writers). Plus one signature change: `buildContextPacket(state, journal)`, and
`buildTools(turn)` in place of `buildTools(packet, dispatch, writer)`.

---

## Synthesis decision

Four candidates were produced in parallel (Claude Fable, GPT Sol, Grok 4.6, Claude Opus —
one design each), cross-judged by a fifth model (Grok 4.5) against a six-criterion rubric,
and read end to end by the orchestrator. No dropouts.

**Convergence.** All four candidates independently arrived at the same core loop: ship the
`GameState` snapshot per turn, run the real pure reducer against a request-local fork so
tool `execute` returns truthful `{ ok, reason }` to the model mid-stream, and stream
accepted actions back for the client store — the only durable truth — to replay. Per the
arena's convergence rule, that shape ships as consensus; no candidate proposed client-side
`onToolCall` or server-held state as its primary design, and every candidate independently
rejected both for the same reasons (a second LLM round-trip; persistence by another name).

**Base: candidate 4 (this document's Shape).** The judge scored candidates 4 and 2 tied at
30/30 and recommended 4; the orchestrator agreed. Deciding factors, all of the form
"invariants live in structure a future edit cannot miss": the `Guards` mapped type makes an
unguarded Action a compile error; `applyVerdict`'s four-outcome union is the most honest
consistency story; producer-namespaced bus events keep the vocabulary at 14; the
volatility-ordered prompt blocks keep the Anthropic cache warm across integrity tiers and
tool steps.

**Grafted:**

- From candidate 2: server-stamped `offerId` with current-offer-only clicks
  (`protocol.ts`, `useOracleTurn.ts`) — turnId alone cannot distinguish two racks offered
  in one turn.
- From candidate 2: capability-reduced toolsets — 'look'/'prefetch' turns get no mutating
  tools (`tools.ts` §4), which structurally removes the "stale prefetch buffer commits a
  mutation" class the judge flagged in candidate 3.
- From candidate 3: the argument, recorded in protocol.ts's alternatives, that replayed
  commits must be *named actions* because they commute with concurrent 60fps dispatches
  where a returned snapshot would clobber them.

**Rejected, and why:**

- Candidate 2's input lease (freeze mutating gameplay during a Pane turn). The judge
  recommended grafting it; the orchestrator overrode: it removes the `diverged` verdict
  class at the cost of freezing combat exactly when the troll-parley beat needs the world
  live, and `applyVerdict` already contains the damage to a journal line. Revisit only if
  rehearsal shows divergence narration reading as a bug (an open question below).
- Candidate 1's bare `data-action` replay without an idempotency key — strict-mode double
  renders and re-revealed buffers double-apply.
- Candidate 3's dual packet+snapshot request body — the packet must be derived server-side
  from the shipped snapshot or the two drift (ARCHITECTURE §9's stale-packet failure).
- Candidate 2's underscore event names — one naming dialect, producer-namespaced.

**Gaps all candidates shared, fixed in synthesis:** the AI SDK `ChatTransport` signature is
assumed, not verified — now an explicit H0 task with a `DefaultChatTransport` fallback
(`lib/client/transport.ts`); enemy-HP ownership is resolved by `STRIKE_ENTITY` (base
design) so Phaser never keeps a parallel HP copy.

---

## Tradeoffs accepted

- We accept shipping the full `GameState` (~8KB) in every request body in exchange for the
  fork existing at all — and therefore for truthful tool results with zero extra network
  legs.
- We accept running the reducer twice per accepted action (once as a dry run, once as the
  commit) in exchange for the client store remaining the single source of truth. The
  reducer is pure and synchronous, so the second run is microseconds.
- We accept that a divergent verdict produces narration that is briefly wrong, in exchange
  for never blocking keyboard input during a Pane turn. The recovery is a journal line and
  reads as the Pane being fallible.
- We accept a client-authored snapshot as trusted input in exchange for no server session.
  There is no auth, no persistence, and one player; the only thing a tampered snapshot can
  do is let a player cheat their own single-player demo.
- We accept a custom `ChatTransport` (more surface than `DefaultChatTransport`) in exchange
  for prefetch being invisible above it — no branching in the component, no second message
  list to merge.
- We accept diverging from `ARCHITECTURE.md`'s `world:focus` name in exchange for a bus
  vocabulary where the namespace tells you the producer.
- We accept a hard step budget of 4, which can truncate an unusually chatty turn, in
  exchange for a bounded worst-case turn length on stage.
- We accept that the prefetch digest can produce a false hit (two states that hash alike
  but read differently) in exchange for buffers surviving movement. Bucketing distance is
  the specific gamble.

## Alternatives considered

**Server proposes, client applies and echoes (the starter's implied design).** Tools would
write `data-proposal` parts and return `{ pending: true }`; the client applies and sends the
result back so the model can narrate it. It loses on both depth and correctness. The public
surface *grows* — the Pane now needs a `respondToProposal` API, the transport needs an
upstream channel that the SDK does not provide, and the model's tool result type becomes a
three-state `pending | ok | failed` that every tool description must explain. Worse, the
echo is a second POST with a full context re-upload in the middle of a sentence, so the
narration stalls for a round trip inside a 900ms budget, and the model must be prompted to
handle "I don't know yet" — the exact hedging the docs' voice rules forbid. It buys one
thing: the client never has to trust a snapshot it authored itself, which in a
single-player demo with no persistence is worth nothing.

**Client-side tool execution via `onToolCall` + `addToolResult`.** Cleaner-looking than the
echo because the SDK hides the resubmission, but the cost is identical and now invisible:
client tool execution ends the assistant response, and the automatic continuation is a
fresh POST and a fresh prefill. Two network legs and two prefills per turn, and prompt
caching helps less because the message list changed. It also makes prefetch impossible in
its current form — a buffered stream would fire client-side tool executions on reveal
whose results have nowhere to go.

**Authoritative server state in a module-scope `Map`.** Would remove the snapshot upload
and the double reducer run. Rejected because it is persistence by another name (forbidden
by `PRD.md` §5), it breaks under serverless instance churn, and Phaser would then be
reading a client cache of server state — a fourth layer wearing a disguise.

## Open questions and risks

- Is `STRIKE_ENTITY` acceptable as an addition to the near-final `Action` union, or would
  you rather combat drive `SET_ENTITY_STATE` only and keep enemy hp out of the sim
  entirely (accepting one-hit-kill enemies for the demo)?
- `ARCHITECTURE.md` §2's reducer returns `no_such_container`, which is not in
  `RejectReason`. Is `wrong_kind` the right general form, or do you want per-kind reasons
  because the model narrates them differently?
- Does the divergence recovery ("the world moved…") read as characterisation or as a bug
  when you hear it out loud? It is the one place the design accepts briefly-wrong
  narration, and it is a five-minute test with a real chest.
- Should a prefetched turn be *committed* on reveal even if the digest changed but the
  specific proposal is still legal, rather than discarded wholesale? Discarding is safer
  and costs one live request; committing selectively is faster and harder to reason about.
- Is renaming `world:focus` → `pane:focus` worth breaking the copy-paste code in
  `ARCHITECTURE.md` §5, given someone may paste it at hour 5 under time pressure?
- The step budget of 4 assumes text → focus → mutation → text. Does the troll parley need
  a fifth step, and if so is the extra ~700ms acceptable at that one moment?

## Next implementation step

Write `lib/sim/rules.ts`'s `check()` and the `guards` table with real bodies, then
`applyAction` on top of it, and prove both from a headless test file — because every other
module in this design is downstream of that one function being trustworthy.


---

# Build order — this design mapped onto ROADMAP H0–H9

The ordering principle from `ROADMAP.md` holds: the demo path is built first and stays
working all day. Below, each hour lists the sketch files that get real bodies, the gate,
and the risk that hour retires.

Legend: **NEW** = created this hour · **FILL** = bodies replace `not implemented` ·
**TOUCH** = small addition to an existing file.

---

## H0 — Setup (30 min)

| File | Action |
|---|---|
| `lib/sim/types.ts` | **NEW**, complete (it is data, not code — write it once, all of it) |
| `game/EventBus.ts` | **NEW**, `BusEvents` + `TypedBus` facade only; `installWorldAdapter` stays stubbed |
| `app/api/oracle/route.ts` | **NEW**, streams a hardcoded "hello" — no packet, no tools |
| `components/useGame.ts` | **NEW**, four lines |

**Gate:** Phaser canvas renders; `/api/oracle` streams. Both halves work independently.
`.env.local` gitignored, verified before the first commit.

**Also this hour (10 min, judge-flagged):** diff `lib/client/transport.ts`'s
`ChatTransportLike` against the installed `ai` package's `ChatTransport` types and fix the
sketch to match. Every arena candidate assumed this signature; verify it while the day is
young. Fallback if drifted: `DefaultChatTransport` + `prepareSendMessagesRequest`, prefetch
degrades to nothing (H9 polish, not correctness).

**Why the bus interface this early:** it costs ten minutes and it is the file every later
hour imports. Writing `BusEvents` before any producer exists is what stops the vocabulary
growing to 40 events by H6.

## H1 — The sim, headless (90 min)

| File | Action |
|---|---|
| `lib/sim/rules.ts` | **FILL** — `check`, the full `guards` table, `defeatsSeal`, `QUEST_FLAGS`, `LIMITS` |
| `lib/sim/reducer.ts` | **FILL** — `applyAction`, `applyBatch`, `describeEvent`, `initialState` |
| `lib/sim/select.ts` | **FILL** — `nearestEntities`, `isAdjacent`, `findItem`, `bagHasRoomFor`, `hearts` |
| `lib/sim/registry.ts` | **FILL** — 8 authored items |
| `lib/sim/store.ts` | **FILL** — `dispatch` + `hydrate`; `applyVerdict` stays stubbed until H4 |
| `__tests__/sim.test.ts` | **NEW** — 8 cases |

The eight tests, chosen to cover the demo's failure modes rather than the happy path:
open a locked chest → `locked`; open it twice → `already_open`; pry with the crowbar →
ok + `item_gained`; pry with the mushroom → `wrong_tool`; grant an item not in
`contents` → `not_in_contents`; grant an unregistered id → `no_such_item`; grant into a
full bag → `bag_full`; `applyBatch` with a bad second effect → nothing applied.

**Gate:** open a chest and take damage from a scratch page. No Phaser, no LLM. The last
test is the one that matters — atomicity is not visible until it breaks on stage.

## H2 — Movement and combat (90 min)

| File | Action |
|---|---|
| `game/scenes/Overworld.ts` | **FILL** — hardcoded tilemap, `spawnEntities`, `syncFromStore` |
| `game/systems/combat.ts` | **FILL** |
| `game/systems/proximity.ts` | **FILL** — both rings, though only the reach ring is used yet |
| `game/EventBus.ts` | **FILL** `installWorldAdapter` |

**Gate:** it's a game. Keyboard only. One slime dies. HP display driven by the store.

**Note:** `spawnEntities` reads `state.entities` on `sim:hydrated`, so the hardcoded map
and the H8 LDtk map take the identical path. That is what makes cut-list item 5 free.

## H3 — The Pane speaks (90 min)

| File | Action |
|---|---|
| `lib/oracle/journal.ts` | **FILL** |
| `lib/oracle/context.ts` | **FILL** `buildContextPacket` + `pickPublicFlags`; `digestPacket` stubbed |
| `lib/oracle/prompt.ts` | **FILL** — `STABLE_BLOCKS`, `buildSystemPrompt`, `tierOf`, `pickModel` |
| `lib/oracle/protocol.ts` | **NEW**, complete (types only, no bodies but `verdictKey`) |
| `lib/oracle/turn.ts` | **FILL** `parseOracleRequest` + `createTurnSim` with `propose` stubbed to always refuse |
| `app/api/oracle/route.ts` | **FILL** — real `streamText`, no tools |
| `lib/client/transport.ts` | **FILL** — no prefetch branch yet |
| `lib/client/useOracleTurn.ts` | **FILL** — `messages`, `status`, `ask`; `rack`/`choose`/`look` stubbed |
| `components/pane/Pane.tsx` | **FILL** — plain styling |

**Gate:** type "what do you see" and it describes your actual surroundings, HP included.

**Why the snapshot-up plumbing lands here rather than H4:** the request shape
(`snapshot`, not `packet`) is the H4 design's foundation. Building H3 on `packet` and
migrating at H4 means rewriting the transport at the busiest hour of the day.

## H4 — Tools and validation (2 hrs) ← the core

| File | Action |
|---|---|
| `lib/oracle/turn.ts` | **FILL** — real `propose`, `proposeAll`, `spend`, verdict streaming |
| `lib/oracle/tools.ts` | **FILL** — all seven tools |
| `lib/sim/store.ts` | **FILL** `applyVerdict` — all four `VerdictOutcome` branches |
| `lib/client/useOracleTurn.ts` | **FILL** — `onData` fan-out, `rack`, `choose` |
| `components/pane/ChoiceRack.tsx` | **FILL** |
| `lib/sim/recipes.ts` | **FILL** — enough for `suggest_craft` to return something |

Order within the hour: `propose` → `applyVerdict` → `open_container` end to end → then the
remaining tools. Do not write six tools before one round-trips.

**Gate:** the chat opens a chest, the chest is really open, and asking for a free
legendary sword fails in character on the first try. Test the divergence path by hand:
open the chest with Enter while the Pane is mid-sentence about it, and listen to what it
says next.

## H5 — Narrative focus (60 min)

| File | Action |
|---|---|
| `game/systems/focus.ts` | **FILL** |
| `lib/oracle/tools.ts` | **TOUCH** — tune `focus_entity`'s description until it fires unprompted |

**Gate:** the light lands mid-sentence. **Record a clip now as insurance.**

## H6 — Art pass (90 min)

| File | Action |
|---|---|
| `components/pane/Pane.tsx` | **FILL** `Glass`, `PaneMessageView` — blur, gradient border, two typefaces, drift, ink-bleed |
| `game/scenes/Overworld.ts` | **TOUCH** — real tiles and sprites, walk animation, torch flicker |

**Gate:** it's photogenic. No new interfaces this hour — by design, so an art overrun
cannot block a code path.

## H7 — Inventory and crafting (90 min)

| File | Action |
|---|---|
| `components/hud/BagGrid.tsx`, `Hotbar.tsx` | **NEW** — obvious interfaces, deliberately unsketched |
| `lib/sim/recipes.ts` | **FILL** — 6 recipes, `craftableNow` |
| `lib/oracle/flavor.ts` | **FILL** |

`craftableNow` is shared by the grid and `suggest_craft`, so the Pane can never suggest
something the grid would refuse.

## H8 — Content (60 min)

| File | Action |
|---|---|
| `lib/ldtk/load.ts` | **FILL** — including the boot-time validation of `contents` ids |
| `scripts/bake-flavor.mjs` | **NEW** |
| `lib/oracle/prompt.ts` | **TOUCH** — tune the four `VOICE_TIERS` against real damage |

The troll parley needs no new code: it is an `elite` entity with `paneWorthy`, tags
`['wounded','hungry']`, and `troll_pacified` already in `QUEST_FLAGS`. If it needs code,
something is wrong with the tag design.

**Gate:** placing a chest in LDtk gives the Pane something new to talk about with no code
change.

## H9 — Polish and rehearse (90 min)

| File | Action |
|---|---|
| `lib/client/prefetch.ts` | **FILL** — `bufferStream`, `createPrefetchController` |
| `lib/oracle/context.ts` | **FILL** `digestPacket`, `bucketDistance` |
| `lib/client/transport.ts` | **TOUCH** — the `claim` branch (three lines) |
| `game/systems/proximity.ts` | **TOUCH** — wire the approach ring to `arm`/`disarm` |

**Gate:** `next build && next start`, demo on localhost. Rehearse the 90 seconds aloud,
three times, timed. Check `prefetch.stats()` after a rehearsal — if hits are near zero the
digest is too strict and the ten-minute fix is widening a bucket.

**Why prefetch is last despite being the biggest perceived-speed win:** it is the only
feature in the design that touches nothing else. `bufferStream` + `claim` is one branch in
the transport; if H9 runs out, the game is unchanged and merely slower.

---

## What the cut list does to this design

`ROADMAP.md` cuts, in cutting order, and what each one costs here:

| # | Cut | Cost to this design |
|---|---|---|
| 1 | Crafting UI, keep `suggest_craft` | Delete `BagGrid`'s craft panel. `craftableNow` stays (the tool needs it), `CRAFT` and its guard stay untested-but-harmless. **No interface changes.** |
| 2 | Sound | `game/systems/*` lose a few `scene.sound.play` calls. **Nothing structural.** |
| 3 | Pane integrity / crack system | `VOICE_TIERS` collapses to the single `intact` entry and the crack overlay goes. `tierOf` still resolves; `digestPacket` still reads a tier (always the same one). **No caller changes** — this is what the tiers-as-data decision buys. |
| 4 | Multiple enemy types | Content only. |
| 5 | LDtk, keep the hardcoded map | `lib/ldtk/load.ts` is never filled in; `initialState()` keeps authoring entities. `spawnEntities` already reads from the store on `sim:hydrated`, so **the scene does not know which one it got.** |
| 6 | Inventory grid, hotbar only | `BagGrid` goes. `bag: Item[]` is unaffected — the array was the render model, and now it renders three slots instead of twelve. |

**Modules that survive every cut intact:** `types.ts`, `rules.ts`, `reducer.ts`,
`select.ts`, `store.ts`, `protocol.ts`, `turn.ts`, `tools.ts`, `context.ts`,
`useOracleTurn.ts`, `EventBus.ts`, `focus.ts`. That is the whole proposal/application loop
and the whole signature effect — which matches `ROADMAP.md`'s "never cut" list: the sim
validators, the focus effect, and the adversarial beat.

**The cut that would break this design, and is therefore not on the list:** removing the
client-side store in favour of server state. Every open question above resolves the way it
does because the store is the single authoritative copy and the fork is disposable.

---

## Files deliberately not sketched

`app/layout.tsx`, `app/page.tsx`, `components/GameCanvas.tsx`, `components/pane/PaneMessage.tsx`,
`components/pane/StatGlyphs.tsx`, `components/hud/*`, `game/main.ts`, `game/scenes/{Boot,Preload,UIScene}.ts`,
`game/entities/*`. Each has an interface that is either fixed by the framework
(`GameCanvas` is `dynamic(..., { ssr: false })` and takes no props — that is the entire
design) or fully determined by a type already written (`StatGlyphs` renders
`hearts(state)`). Sketching them would add pages without adding decisions.
