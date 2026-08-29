import { describe, expect, it } from 'vitest';
import { pruneIncompleteToolParts } from '../lib/oracle/messages';

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
