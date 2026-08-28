import { describe, expect, it } from 'vitest';
import {
  collapseRestatedNarration,
  paneParagraphs,
  shapePaneText,
} from '../lib/client/paneText';

const DUMP =
  '[focus_entity: chest_lockbox, spotlight] The rusted lockbox has a cold seam and iron teeth; it is sealed, which is more than I can say for your footing. The grey slime is still here too, and pretending not to be a problem is how people get peeled.The rusted lockbox sits in the dust with a cold draft licking its seam; that means something inside, or a stupid little trap. The grey slime is one pace away, so if you start prying at it now, do not act shocked when it notices.';

describe('shapePaneText', () => {
  it('strips bracket tool syntax and recovers focus', () => {
    const { text, focus } = shapePaneText(DUMP);
    expect(text).not.toMatch(/focus_entity/);
    expect(text).not.toMatch(/\[/);
    expect(focus).toEqual({ entityId: 'chest_lockbox', style: 'spotlight' });
    expect(text.startsWith('The rusted lockbox')).toBe(true);
  });

  it('inserts a space where two generations were glued', () => {
    const { text } = shapePaneText('peeled.The rusted');
    expect(text).toBe('peeled. The rusted');
  });

  it('keeps only the first look when the model paraphrases itself', () => {
    const { text } = shapePaneText(DUMP);
    expect(text).toContain('iron teeth');
    expect(text).not.toContain('cold draft');
    expect(paneParagraphs(text)).toHaveLength(1);
  });
});

describe('collapseRestatedNarration', () => {
  it('does not drop a setup-then-outcome pair that shares a noun', () => {
    const text = collapseRestatedNarration(
      'You put your weight on the bar. It complains before it moves. The shrine light spills through the gap. The slime has noticed.',
    );
    expect(text).toContain('shrine light');
    expect(text).toContain('weight on the bar');
  });
});

describe('paneParagraphs', () => {
  it('splits a four-sentence wall that is not a restatement into two stanzas', () => {
    const wall =
      'You lean on the bar until the oak complains. Rust flakes onto your boots. The shrine across the room brightens as if it were listening. The slime takes one step closer.';
    const paras = paneParagraphs(wall);
    expect(paras.length).toBe(2);
    expect(paras[0]).toContain('oak complains');
    expect(paras[1]).toContain('slime');
  });
});
