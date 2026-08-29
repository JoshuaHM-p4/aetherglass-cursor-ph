// app/api/oracle/route.ts
//
// The only place provider keys are read (AGENTS.md #8). No NEXT_PUBLIC_ AI keys, no
// client-side fetch to a model provider. Claude if ANTHROPIC_API_KEY is set, else GPT.
//
// Thin by construction: parse, fork, stream, respond. Every decision it looks like it is
// making is made somewhere testable — the prompt in prompt.ts, the tools in tools.ts, the
// legality in rules.ts, the packet in context.ts.

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse,
  stepCountIs, streamText,
  type UIMessage,
} from 'ai';
import {
  buildSystemPrompt, pickModel, type OracleProvider,
} from '../../../lib/oracle/prompt';
import { createTurnSim, parseOracleRequest } from '../../../lib/oracle/turn';
import { pruneIncompleteToolParts } from '../../../lib/oracle/messages';
import { buildTools } from '../../../lib/oracle/tools';

export const maxDuration = 30;
/** Node, not edge: `structuredClone` in the reducer and a static flavor.json import. */
export const runtime = 'nodejs';

/**
 * One turn = one request = one `streamText` call. Tool continuation happens as STEPS
 * inside that call (`stopWhen: stepCountIs(4)` for speak/choose; look/prefetch stop
 * after the forced focus plus one narration), not as a second round trip.
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

  let provider: OracleProvider;
  try {
    provider = resolveOracleProvider();
  } catch {
    return new Response('the glass has gone dark', { status: 503 });
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const turn = createTurnSim({ snapshot, journal, turnId, kind, writer });
      const { text: system } = buildSystemPrompt({
        packet: turn.packet,
        journal,
        kind,
      });
      const modelId = pickModel(kind, turn.packet, provider);

      const glance = kind === 'look' || kind === 'prefetch';
      let converted;
      try {
        converted = await convertToModelMessages(
          pruneIncompleteToolParts(messages as UIMessage[]),
          { ignoreIncompleteToolCalls: true },
        );
      } catch {
        converted = await convertToModelMessages(
          pruneIncompleteToolParts(messages as UIMessage[]).map((message) => ({
            ...message,
            parts: message.parts.filter((part) => part.type === 'text' || part.type === 'step-start'),
          })),
          { ignoreIncompleteToolCalls: true },
        );
      }
      const result = streamText({
        model: provider === 'anthropic' ? anthropic(modelId) : openai(modelId),
        system,
        messages: converted,
        tools: buildTools(turn),
        // OpenAI 429s (especially daily caps) do not recover in a few seconds.
        // Default is 2 retries / 3 attempts — that is the 8s “200 with an error” pane.
        maxRetries: 0,
        // toolChoice is sticky across steps. Forcing focus_entity at the top
        // level made every continuation call it again, then narrate again —
        // the glass spoke the same look twice.
        ...(glance
          ? {
              prepareStep: ({ stepNumber }: { stepNumber: number }) =>
                stepNumber === 0
                  ? { toolChoice: { type: 'tool' as const, toolName: 'focus_entity' } }
                  : { toolChoice: 'none' as const },
            }
          : {}),
        stopWhen: stepCountIs(glance ? 2 : 4),
        ...(provider === 'anthropic'
          ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }
          : {}),
      });

      writer.merge(result.toUIMessageStream());
    },
    onError: (error) => glassErrorLine(error),
  });

  return createUIMessageStreamResponse({ stream });
}

function keyPresent(name: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY'): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

/** Claude wins when both keys are set. The Pane has no model picker (PRD §5). */
function resolveOracleProvider(): OracleProvider {
  if (keyPresent('ANTHROPIC_API_KEY')) return 'anthropic';
  if (keyPresent('OPENAI_API_KEY')) return 'openai';
  throw new Error('no_oracle_key');
}

function glassErrorLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/rate limit/i.test(text)) return 'the glass is overdrawn — rest a while';
  return 'the glass has gone dark';
}
