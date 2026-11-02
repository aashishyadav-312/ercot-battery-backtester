import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineText, parseBlocks, parseDoc, parseInline } from './markdown';

const FINDINGS_MD = readFileSync(resolve(process.cwd(), '../results/FINDINGS.md'), 'utf8');

describe('inline Markdown', () => {
  it('reads bold, code and links, and unescapes pipes', () => {
    expect(parseInline('a **b $48.7** `c_d` [e](http://x.y) f \\| g')).toEqual([
      { t: 'text', v: 'a ' }, { t: 'b', c: [{ t: 'text', v: 'b $48.7' }] }, { t: 'text', v: ' ' }, { t: 'code', v: 'c_d' },
      { t: 'text', v: ' ' }, { t: 'a', href: 'http://x.y', c: [{ t: 'text', v: 'e' }] }, { t: 'text', v: ' f | g' },
    ]);
  });
});

describe('blocks', () => {
  it('reads a table with escaped pipes, a list with a wrapped item, and a paragraph', () => {
    const blocks = parseBlocks([
      '| A | B \\|C\\| |', '|---|---:|', '| 1 | 2 |', '',
      '- first', '  wraps on', '- second', '',
      'one', 'two',
    ]);
    expect(blocks.map((b) => b.t)).toEqual(['table', 'ul', 'p']);
    const t = blocks[0];
    if (t.t !== 'table') throw new Error('table');
    expect(t.head.map(inlineText)).toEqual(['A', 'B |C|']);
    expect(t.align).toEqual(['left', 'right']);
    const ul = blocks[1];
    if (ul.t !== 'ul') throw new Error('ul');
    expect(ul.items.map(inlineText)).toEqual(['first wraps on', 'second']);
    const p = blocks[2];
    if (p.t !== 'p') throw new Error('p');
    expect(inlineText(p.c)).toBe('one two');
  });
});

describe('results/FINDINGS.md', () => {
  const doc = parseDoc(FINDINGS_MD);

  it('has the numbered findings in order, each with a title', () => {
    const numbered = doc.sections.filter((s) => s.n != null);
    expect(numbered.map((s) => s.n)).toEqual(numbered.map((_, i) => i + 1));
    expect(numbered.length).toBeGreaterThanOrEqual(11);
    for (const s of numbered) expect(s.title.length).toBeGreaterThan(10);
  });

  it('keeps every table rectangular, including the one with escaped pipes in its header', () => {
    let tables = 0;
    for (const s of doc.sections) {
      for (const b of s.body) {
        if (b.t !== 'table') continue;
        tables++;
        for (const r of b.rows) expect(r.length, `${s.heading}: ${b.head.map(inlineText).join(' | ')}`).toBe(b.head.length);
      }
    }
    expect(tables).toBeGreaterThan(15);
    const rtcb = doc.sections.find((s) => s.n === 8)!.body.find((b) => b.t === 'table');
    if (rtcb?.t !== 'table') throw new Error('table');
    expect(rtcb.head.map(inlineText)).toContain('Mean |RT − DA| ($/MWh)');
  });

  it('leaves no raw Markdown markers in rendered text', () => {
    for (const s of doc.sections) {
      const texts: string[] = [];
      for (const b of s.body) {
        if (b.t === 'p' || b.t === 'h') texts.push(inlineText(b.c));
        else if (b.t === 'ul') b.items.forEach((i) => texts.push(inlineText(i)));
        else { b.head.forEach((c) => texts.push(inlineText(c))); b.rows.forEach((r) => r.forEach((c) => texts.push(inlineText(c)))); }
      }
      for (const t of texts) {
        expect(t, s.heading).not.toMatch(/\*\*|`/);
      }
    }
  });
});
