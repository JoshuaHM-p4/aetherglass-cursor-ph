// UIMessage history sent back into convertToModelMessages. A turn that ends on a
// tool call (chest already_open, bag_full, stopWhen) can leave parts in
// input-available. The next user line then throws MissingToolResultsError and
// the glass never speaks again. Drop those parts at the boundary.

export type ToolishPart = { type: string; state?: string };

export type MessageLike = { parts: ToolishPart[] };

const COMPLETE_TOOL = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'approval-responded',
]);

export function isToolPart(part: ToolishPart): boolean {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function pruneIncompleteToolParts<T extends MessageLike>(messages: T[]): T[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.filter(
      (part) => !isToolPart(part) || COMPLETE_TOOL.has(part.state ?? ''),
    ),
  }));
}

/**
 * OpenAI Responses rejects a 400 if two input items share an `itemId`
 * (`Duplicate item found with id msg_…`). A look that tools then narrates
 * stores the same `msg_` on more than one part. We resend the full history
 * each turn and do not use `previous_response_id`, so those ids are not useful.
 */
export function stripOpenAiItemIds<T extends MessageLike>(messages: T[]): T[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => stripPartMeta(part)),
  }));
}

export function prepareOracleMessages<T extends MessageLike>(messages: T[]): T[] {
  return stripOpenAiItemIds(pruneIncompleteToolParts(messages));
}

type MetaBag = Record<string, unknown>;

const PART_META = [
  'providerMetadata',
  'callProviderMetadata',
  'resultProviderMetadata',
  'providerOptions',
] as const;

function isRecord(value: unknown): value is MetaBag {
  return typeof value === 'object' && value !== null;
}

function withoutItemId(meta: unknown): unknown {
  if (!isRecord(meta)) return meta;
  const openai = meta.openai;
  if (!isRecord(openai) || !('itemId' in openai)) return meta;
  const { itemId: _drop, ...openaiRest } = openai;
  const next: MetaBag = { ...meta };
  if (Object.keys(openaiRest).length === 0) delete next.openai;
  else next.openai = openaiRest;
  return Object.keys(next).length === 0 ? undefined : next;
}

function stripPartMeta<P extends ToolishPart>(part: P): P {
  const rec = part as unknown as MetaBag;
  let changed = false;
  const next: MetaBag = { ...rec };
  for (const key of PART_META) {
    if (!(key in next)) continue;
    const stripped = withoutItemId(next[key]);
    if (stripped === next[key]) continue;
    changed = true;
    if (stripped === undefined) delete next[key];
    else next[key] = stripped;
  }
  return (changed ? next : part) as P;
}

/** Same strip after convertToModelMessages, which copies metadata onto content parts. */
export function stripOpenAiItemIdsFromModelMessages<
  T extends { providerOptions?: unknown; content?: unknown },
>(messages: T[]): T[] {
  return messages.map((message) => {
    const options = withoutItemId(message.providerOptions);
    const content = message.content;
    const nextContent = Array.isArray(content)
      ? content.map((part) => {
          if (!isRecord(part) || !('providerOptions' in part)) return part;
          const stripped = withoutItemId(part.providerOptions);
          if (stripped === part.providerOptions) return part;
          const next = { ...part };
          if (stripped === undefined) delete next.providerOptions;
          else next.providerOptions = stripped;
          return next;
        })
      : content;
    const optionsChanged = options !== message.providerOptions;
    const contentChanged = nextContent !== content;
    if (!optionsChanged && !contentChanged) return message;
    return {
      ...message,
      ...(optionsChanged ? { providerOptions: options } : {}),
      ...(contentChanged ? { content: nextContent } : {}),
    };
  });
}
