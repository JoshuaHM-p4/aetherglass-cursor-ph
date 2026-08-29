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
