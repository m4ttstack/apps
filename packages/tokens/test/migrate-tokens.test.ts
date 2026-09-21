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
});
