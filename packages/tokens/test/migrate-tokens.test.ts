import { describe, expect, it } from 'vitest';

import {
  planRenames,
  renameInTsx,
  rewriteCss,
} from '../scripts/migrate-tokens.ts';

describe('planRenames', () => {
  it('renames by property class and infers the band from the rule', () => {
    const css = `.a { font-size: 13.26px; color: var(--muted-text); background: var(--accent); }`;
    const r = planRenames(css, 17);
    expect(r.map(x => [x.property, x.from, x.to, x.band])).toEqual([
      ['color', '--muted-text', '--text-3', 'meta'],
      ['background', '--accent', '--fill-accent', null],
    ]);
    expect(rewriteCss(css, 17).renames).toEqual(r);
  });

  it('inherits font-size from a prefix selector in the same file and maps type steps by name', () => {
    const css = `.row { font-size: var(--type-small); } .row-meta { color: var(--fg); } .x { color: var(--accent); font-size: var(--type-body); }`;
    const r = planRenames(css, 17);
    expect(r.find(x => x.from === '--fg')).toMatchObject({
      to: '--text-1',
      band: 'small',
    });
    expect(r.find(x => x.from === '--accent')).toMatchObject({
      to: '--text-accent',
      band: 'body',
    });
  });

  it('marks a colour rename with no size as unresolved and defaults it to the meta or small token', () => {
    const css = `.a { color: var(--muted); } .b { color: var(--green); }`;
    const r = planRenames(css, 17);
    expect(r[0]).toMatchObject({
      to: '--text-3',
      band: null,
      unresolved: true,
    });
    expect(r[1]).toMatchObject({
      to: '--text-ok-small',
      band: null,
      unresolved: true,
    });
  });

  it('leaves --muted alone outside color and turns dots into fills', () => {
    const css = `.a { border: 1px solid var(--muted); background: var(--dot-ok); }`;
    const r = planRenames(css, 17);
    expect(r).toEqual([
      expect.objectContaining({
        property: 'background',
        from: '--dot-ok',
        to: '--fill-ok',
      }),
    ]);
  });

  it('uses the hover fill inside :hover rules', () => {
    const css = `.a:hover { background: var(--accent); }`;
    expect(planRenames(css, 17)[0]).toMatchObject({
      to: '--fill-accent-hover',
    });
  });

  it('renames tokyo mirrors and style-object strings in tsx', () => {
    const src = `const s = { color: 'var(--tk-muted-text)', background: 'var(--tk-accent)', fontSize: 'var(--tk-fs-3xs)' };`;
    const { out, renames, unresolved } = renameInTsx(src);
    expect(out).toContain(`color: 'var(--tk-text-4)'`);
    expect(out).toContain(`background: 'var(--tk-fill-accent)'`);
    expect(renames).toEqual([
      expect.objectContaining({
        property: 'color',
        from: '--tk-muted-text',
        to: '--tk-text-4',
      }),
      expect.objectContaining({
        property: 'background',
        from: '--tk-accent',
        to: '--tk-fill-accent',
      }),
    ]);
    expect(unresolved).toEqual([]);
  });

  it('does not inherit font-size from a selector that is merely a string prefix', () => {
    const css = `.row { font-size: var(--type-small); } .rowdy { color: var(--muted-text); }`;
    const r = planRenames(css, 17);
    expect(r.find(x => x.from === '--muted-text')).toMatchObject({
      to: '--text-3',
      band: null,
      unresolved: true,
    });
  });

  it('rewrites the fallback and exact var() forms by source position, not by which form matches first', () => {
    const css = `.a { font-size: 12px; color: var(--accent, red); background: var(--accent); }`;
    const { out } = rewriteCss(css, 17);
    expect(out).toContain(`color: var(--text-accent-small, red)`);
    expect(out).toContain(`background: var(--fill-accent)`);
  });

  it('does not double-count a nested &:hover rule and keeps the hover fill', () => {
    const css = `.btn { font-size: 14px; background: var(--tk-accent); &:hover { background: var(--tk-accent); } }`;
    const r = planRenames(css, 16);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ to: '--tk-fill-accent' });
    expect(r[1]).toMatchObject({ to: '--tk-fill-accent-hover' });
    const { out } = rewriteCss(css, 16);
    expect(out).toContain('background: var(--tk-fill-accent);');
    expect(out).toContain('background: var(--tk-fill-accent-hover);');
  });

  it('treats a non-& nested rule as a descendant selector and still renames', () => {
    const css = `.card { .label { color: var(--tk-muted-text); } }`;
    const r = planRenames(css, 16);
    expect(r).toEqual([
      expect.objectContaining({
        to: '--tk-text-3',
        band: null,
        unresolved: true,
      }),
    ]);
  });

  it('routes dot tokens to hue text in color and keeps them as fill elsewhere', () => {
    const css = `.a { color: var(--dot-bad); font-size: 15px; } .b { background: var(--dot-bad); }`;
    const r = planRenames(css, 17);
    expect(r.find(x => x.property === 'color')).toMatchObject({
      to: '--text-bad',
      band: 'body',
      unresolved: false,
    });
    expect(r.find(x => x.property === 'background')).toMatchObject({
      to: '--fill-bad',
    });
  });

  it('renames --ui-text-dimmed and leaves --ui-text-muted untouched', () => {
    const css = `.a { color: var(--ui-text-dimmed); } .b { color: var(--ui-text-muted); }`;
    const r = planRenames(css, 17);
    expect(r).toEqual([
      expect.objectContaining({
        from: '--ui-text-dimmed',
        to: '--ui-text-4',
        unresolved: false,
      }),
    ]);
    const { out } = rewriteCss(css, 17);
    expect(out).toContain(`color: var(--ui-text-4)`);
    expect(out).toContain(`color: var(--ui-text-muted)`);
  });
});
