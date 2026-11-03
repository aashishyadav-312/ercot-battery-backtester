import type { ReactNode } from 'react';
import type { Block, Inline } from '../data/markdown';
import classes from './Markdown.module.css';

/**
 * Links in FINDINGS.md. Web and mailto links and in-page anchors stay links. A relative one ("../docs/X.md") points into
 * the repository, and the site links nowhere on GitHub, so it renders as plain text.
 */
export function resolveHref(href: string): { href: string; external: boolean } | null {
  if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) return { href, external: true };
  if (href.startsWith('#')) return { href, external: false };
  return null;
}

function Inlines({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return n.v;
      case 'b': return <strong key={i}><Inlines nodes={n.c} /></strong>;
      case 'code': return <code key={i}>{n.v}</code>;
      case 'a': {
        const r = resolveHref(n.href);
        if (!r) return <Inlines key={i} nodes={n.c} />;
        return (
          <a key={i} href={r.href} {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            <Inlines nodes={n.c} />
          </a>
        );
      }
    }
  });
}

/** Renders the tree from data/markdown.ts. Tables sit in a scrolling box so a wide one never widens the page. */
export function Markdown({ blocks }: { blocks: Block[] }) {
  return (
    <div className={classes.md}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const H = `h${Math.min(6, b.level)}` as 'h3' | 'h4' | 'h5' | 'h6'; // the page title is h1 and the finding h2, so "###" is h3
            return <H key={i}><Inlines nodes={b.c} /></H>;
          }
          case 'p': return <p key={i}><Inlines nodes={b.c} /></p>;
          case 'ul': return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inlines nodes={it} /></li>)}</ul>;
          case 'table': return (
            <div key={i} className={classes.scroll} tabIndex={0} role="region" aria-label="Table, scrolls sideways when it does not fit">
              <table>
                <thead>
                  <tr>{b.head.map((c, j) => <th key={j} scope="col" style={{ textAlign: b.align[j] }}><Inlines nodes={c} /></th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k} style={{ textAlign: b.align[k] }}><Inlines nodes={c} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
      })}
    </div>
  );
}
