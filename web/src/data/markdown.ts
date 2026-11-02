// A small Markdown reader for results/FINDINGS.md, so the Research page shows the findings as written instead of a copy.
// It handles exactly what that file uses: "## " sections, "###" headings, paragraphs, "-" lists, pipe tables, and the inline
// forms **bold**, `code`, [text](url). It builds a plain tree (rendered to React elements by components/Markdown.tsx), so no
// HTML string is ever injected into the page.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] };

export type Align = 'left' | 'right' | 'center';

export type Block =
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] };

export interface Section {
  /** The number in "## 9. All 642 ...", or null for sections without one ("Not done yet"). */
  n: number | null;
  title: string;
  /** The heading as written, without the "## ". */
  heading: string;
  body: Block[];
}

export interface Doc {
  /** Title line ("# Findings: ...") and the text before the first section. */
  title: string;
  intro: Block[];
  sections: Section[];
}

const INLINE = /(\*\*(?:[^*]|\*(?!\*))+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  for (const part of src.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) out.push({ t: 'b', c: parseInline(part.slice(2, -2)) });
    else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) out.push({ t: 'code', v: part.slice(1, -1) });
    else {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (m) out.push({ t: 'a', href: m[2], c: parseInline(m[1]) });
      else out.push({ t: 'text', v: part.replace(/\\\|/g, '|') });
    }
  }
  return out;
}

/** Cells of one table row: split on "|" that is not escaped as "\|", outer pipes dropped. */
function cells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return body.split(/(?<!\\)\|/).map((c) => c.trim());
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

function alignOf(sep: string): Align {
  const s = sep.trim();
  return s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : 'left';
}

export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = /^(#{3,6})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ t: 'h', level: h[1].length, c: parseInline(h[2].trim()) }); i++; continue; }

    if (line.trimStart().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(cells(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ t: 'table', align, head: head.map(parseInline), rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = /^\s*[-*]\s+(.*)$/.exec(lines[i]);
        if (m) items.push(m[1]);
        else if (/^\s+\S/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      blocks.push({ t: 'ul', items: items.map(parseInline) });
      continue;
    }

    // A paragraph runs to the next blank line or the start of another kind of block.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{3,6}\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])
      && !(lines[i].trimStart().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
  }
  return blocks;
}

/** Split a Markdown file into its title, the text before the first "## ", and its "## " sections. */
export function parseDoc(md: string): Doc {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const intro: string[] = [];
  const raw: { heading: string; lines: string[] }[] = [];
  for (const line of lines) {
    const sec = /^##\s+(.*)$/.exec(line);
    if (sec) raw.push({ heading: sec[1].trim(), lines: [] });
    else if (!raw.length) {
      const t = /^#\s+(.*)$/.exec(line);
      if (t && !title) title = t[1].trim();
      else intro.push(line);
    } else raw[raw.length - 1].lines.push(line);
  }
  return {
    title,
    intro: parseBlocks(intro),
    sections: raw.map(({ heading, lines: l }) => {
      const num = /^(\d+)\.\s+(.*)$/.exec(heading);
      return { n: num ? Number(num[1]) : null, title: num ? num[2] : heading, heading, body: parseBlocks(l) };
    }),
  };
}

/** Plain text of inline nodes (tests, aria labels). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : inlineText(n.c))).join('');
}
