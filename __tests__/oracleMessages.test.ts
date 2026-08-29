import { describe, expect, it } from 'vitest';
import {
  pruneIncompleteToolParts,
  stripOpenAiItemIds,
  stripOpenAiItemIdsFromModelMessages,
} from '../lib/oracle/messages';

describe('pruneIncompleteToolParts', () => {
  it('keeps text and finished tools, drops hanging chest calls', () => {
    const pruned = pruneIncompleteToolParts([
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'The crowbar bites air.' },
          { type: 'tool-unlock', state: 'output-available' },
          { type: 'tool-open_container', state: 'input-available' },
          { type: 'data-verdict' },
        ],
      },
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Look inside' }],
      },
    ]);
    expect(pruned[0]?.parts.map((p) => p.type)).toEqual(['text', 'tool-unlock', 'data-verdict']);
    expect(pruned[1]?.parts).toEqual([{ type: 'text', text: 'Look inside' }]);
  });
});

describe('stripOpenAiItemIds', () => {
  it('drops duplicate OpenAI itemIds so Responses will not 400', () => {
    const id = 'msg_04aae0b9e6e4a89e006a92cf682af887d0a9bf1cde7e4229a1';
    const stripped = stripOpenAiItemIds([
      {
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'A crate.',
            providerMetadata: { openai: { itemId: id } },
          },
          {
            type: 'text',
            text: 'The lid is already off.',
            providerMetadata: { openai: { itemId: id, something: 'keep' } },
          },
        ],
      },
    ]);
    expect(stripped[0]?.parts).toEqual([
      { type: 'text', text: 'A crate.' },
      {
        type: 'text',
        text: 'The lid is already off.',
        providerMetadata: { openai: { something: 'keep' } },
      },
    ]);
  });

  it('strips itemIds copied onto converted model parts', () => {
    const id = 'msg_same';
    const stripped = stripOpenAiItemIdsFromModelMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'one', providerOptions: { openai: { itemId: id } } },
          { type: 'text', text: 'two', providerOptions: { openai: { itemId: id } } },
        ],
      },
    ]);
    expect(stripped[0]?.content).toEqual([
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ]);
  });
});
