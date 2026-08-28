// app/api/oracle/route.ts
//
// The only place ANTHROPIC_API_KEY exists (AGENTS.md #8). No NEXT_PUBLIC_ AI keys, no
// client-side fetch to a model provider.
//
// Thin by construction: parse, fork, stream, respond. Every decision it looks like it is
// making is made somewhere testable — the prompt in prompt.ts, the tools in tools.ts, the
// legality in rules.ts, the packet in context.ts.

import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse,
  stepCountIs, streamText,
  type UIMessage,
} from 'ai';
import { buildSystemPrompt, pickModel } from '../../../lib/oracle/prompt';
import { createTurnSim, parseOracleRequest } from '../../../lib/oracle/turn';

export const maxDuration = 30;
/** Node, not edge: `structuredClone` in the reducer and a static flavor.json import. */
export const runtime = 'nodejs';

/**
 * One turn = one request = one `streamText` call. Tool continuation happens as STEPS
 * inside that call (`stopWhen: stepCountIs(4)`), not as a second round trip: the model
 * gets a real `{ ok, reason }` from the fork and keeps talking on the same stream.
 *
 * Step budget of 4: text -> focus_entity -> mutation -> text-about-the-outcome. Anything
 * beyond that is the model looping, and cutting it off is better than a 6-second turn.
 */
export async function POST(req: Request) {
  let parsed: ReturnType<typeof parseOracleRequest>;
  try {
    parsed = parseOracleRequest(await req.json());
  } catch (err) {
    const status =
      err instanceof Error && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 400;
    const message = err instanceof Error ? err.message : 'malformed oracle request';
    return new Response(message, { status });
  }

  const { messages, snapshot, journal, turnId, kind } = parsed;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const turn = createTurnSim({ snapshot, journal, turnId, kind, writer });
      const { text: system, stablePrefixLength } = buildSystemPrompt({
        packet: turn.packet,
        journal,
        kind,
      });
      const stablePrefix = system.slice(0, stablePrefixLength);
      const volatileSuffix = system.slice(stablePrefixLength).replace(/^\n+/, '');

      const result = streamText({
        model: anthropic(pickModel(kind, turn.packet)),
        system: stablePrefix,
        messages: [
          ...(volatileSuffix.length > 0
            ? [{ role: 'system' as const, content: volatileSuffix }]
            : []),
          ...(await convertToModelMessages(messages as UIMessage[])),
        ],
        stopWhen: stepCountIs(4),
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      });

      writer.merge(result.toUIMessageStream());
    },
    onError: () => 'the glass has gone dark',
  });

  return createUIMessageStreamResponse({ stream });
}
