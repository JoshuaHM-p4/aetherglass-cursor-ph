// Strip leaked tool syntax from Pane narration and recover a focus if the model
// wrote `[focus_entity: id, style]` instead of calling the tool.

import type { FocusData } from '../oracle/protocol';

const BRACKET_CALL = /\[\s*([a-z_][a-z0-9_]*)\s*:\s*([^\]]+)\]/gi;
const XML_JUNK = /<\/?(?:function_calls?|tool_call|invoke|parameter)[^>]*>/gi;

export function shapePaneText(raw: string): { text: string; focus: FocusData | null } {
  let focus: FocusData | null = null;
  let text = raw.replace(BRACKET_CALL, (_whole, name: string, args: string) => {
    if (name.toLowerCase() === 'focus_entity') {
      const bits = args.split(',').map((s) => s.trim()).filter(Boolean);
      const entityId = bits[0];
      const styleRaw = bits[1] ?? 'spotlight';
      const style: FocusData['style'] =
        styleRaw === 'pulse' || styleRaw === 'shatter' ? styleRaw : 'spotlight';
      if (entityId) focus = { entityId, style };
    }
    return '';
  });
  text = text.replace(XML_JUNK, '');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\.([A-Z])/g, '. $1');
  text = text.replace(/ +\./g, '.');
  text = text.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return { text: collapseRestatedNarration(text.trim()), focus };
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z])/;

function firstPhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: string, b: string): number {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let hit = 0;
  for (const w of left) if (right.has(w)) hit += 1;
  return hit / (left.size + right.size - hit);
}

/** Drop a second generation that paraphrases the first (forced-tool step doubling). */
export function collapseRestatedNarration(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return trimmed;
  const sentences = trimmed.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 4) return trimmed;
  const mid = Math.floor(sentences.length / 2);
  const first = sentences.slice(0, mid).join(' ');
  const second = sentences.slice(mid).join(' ');
  if (firstPhrase(first) === firstPhrase(second) || jaccard(first, second) >= 0.5) {
    return first;
  }
  return trimmed;
}

export function isRestatedNarration(a: string, b: string): boolean {
  if (a.trim() === '' || b.trim() === '') return false;
  return firstPhrase(a) === firstPhrase(b) || jaccard(a, b) >= 0.5;
}

/** Break a wall of sentences into short stanzas the glass can set. */
export function paneParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const byBreak = trimmed.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (byBreak.length > 1) return byBreak;
  const sentences = trimmed.split(SENTENCE_SPLIT);
  if (sentences.length <= 2) return [trimmed];
  const stanzas: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    stanzas.push(sentences.slice(i, i + 2).join(' '));
  }
  return stanzas;
}
