import { readFileSync, writeFileSync } from 'node:fs';
import {
  generate,
  parse,
  walk,
  type CssNode,
  type Declaration,
  type FunctionNode,
  type Rule,
} from 'css-tree';

export type Band = 'body' | 'meta' | 'small';
export interface Rename {
  property: string;
  from: string;
  to: string;
  band: Band | null;
  unresolved: boolean;
  line: number;
}
export interface Unresolved {
  line: number;
  text: string;
}

const HUE_OF: Record<string, string> = {
  accent: 'accent',
  green: 'ok',
  red: 'bad',
  amber: 'warn',
  purple: 'purple',
  cyan: 'cyan',
};
const TEXT_ALIAS: Record<string, string> = {
  '--accent-text': 'accent',
  '--red-text': 'bad',
  '--tk-accent-text': 'accent',
  '--tk-red-text': 'bad',
  '--tk-green-text': 'ok',
  '--tk-amber-text': 'warn',
};
const NEUTRAL_TEXT = new Set([
  '--muted-text',
  '--text-muted-on-card',
  '--muted',
  '--tk-muted-text',
  '--tk-muted-on-card',
  '--tk-muted',
]);
const DOT: Record<string, string> = {
  '--dot-ok': '--fill-ok',
  '--dot-warn': '--fill-warn',
  '--dot-bad': '--fill-bad',
  '--tk-dot-ok': '--tk-fill-ok',
  '--tk-dot-warn': '--tk-fill-warn',
  '--tk-dot-bad': '--tk-fill-bad',
};
const SURFACE: Record<string, string> = {
  '--bg': '--page',
  '--surface-inset': '--inset',
  '--surface-overlay': '--overlay',
};
const TYPE_STEP_BAND: Record<string, Band> = {
  display: 'body',
  title: 'body',
  body: 'body',
  meta: 'meta',
  small: 'small',
  micro: 'small',
  lead: 'body',
  '2xs': 'small',
  small_tk: 'small',
  '3xs': 'small',
  '4xs': 'small',
  '5xs': 'small',
};
const BAND_TEXT: Record<Band, string> = {
  body: '--text-2',
  meta: '--text-3',
  small: '--text-4',
};

// The character right after a prefix match must end the selector or open a new
// compound/combinator/pseudo; otherwise ".row" would wrongly feed ".rowdy".
const PREFIX_BOUNDARY = /^[-_.: >,[]/;

const isColor = (p: string) => p === 'color' || p === '-webkit-text-fill-color';
const isFillish = (p: string) => p.startsWith('background') || p === 'fill';
const isBorderish = (p: string) =>
  p.startsWith('border') || p.startsWith('outline') || p === 'scrollbar-color';

function isPrefixOf(sel: string, prefix: string): boolean {
  if (!sel.startsWith(prefix)) return false;
  const rest = sel.slice(prefix.length);
  return rest === '' || PREFIX_BOUNDARY.test(rest);
}

function bandFromSize(value: string, rootPx: number): Band | null {
  const step =
    /var\(--type-([a-z]+)\)/.exec(value)?.[1] ??
    /var\(--tk-fs-([a-z0-9]+)\)/.exec(value)?.[1];
  if (step)
    return (
      TYPE_STEP_BAND[
        step === 'small' && value.includes('--tk-fs') ? 'small_tk' : step
      ] ?? null
    );
  const px = /^([\d.]+)px$/.exec(value)?.[1];
  const rem = /^([\d.]+)r?em$/.exec(value)?.[1];
  const size = px ? Number(px) : rem ? Number(rem) * rootPx : NaN;
  if (Number.isNaN(size)) return null;
  return size >= 14 ? 'body' : size >= 12.5 ? 'meta' : 'small';
}

function hueOf(name: string): { hue: string; tk: boolean } | null {
  const tk = name.startsWith('--tk-');
  const bare = tk ? name.slice(5) : name.slice(2);
  const hue = HUE_OF[bare];
  return hue ? { hue, tk } : null;
}

function target(
  name: string,
  property: string,
  band: Band | null,
  hover: boolean
): { to: string; unresolved: boolean } | null {
  const tk = name.startsWith('--tk-');
  const pre = tk ? '--tk-' : '--';
  if (DOT[name]) return { to: DOT[name]!, unresolved: false };
  if (isColor(property)) {
    if (name === '--fg' || name === '--tk-fg')
      return { to: `${pre}text-1`, unresolved: false };
    if (NEUTRAL_TEXT.has(name))
      return {
        to: `${pre}${BAND_TEXT[band ?? 'meta'].slice(2)}`,
        unresolved: band === null,
      };
    const alias = TEXT_ALIAS[name];
    const hue = alias ?? hueOf(name)?.hue;
    if (hue) {
      const small = band === 'small' || band === 'meta' || band === null;
      return {
        to: `${pre}text-${hue}${small ? '-small' : ''}`,
        unresolved: band === null,
      };
    }
    return null;
  }
  if (isFillish(property) || isBorderish(property)) {
    const h = hueOf(name);
    if (h)
      return {
        to: `${pre}fill-${h.hue}${hover && isFillish(property) ? '-hover' : ''}`,
        unresolved: false,
      };
    if (SURFACE[name] && isFillish(property))
      return { to: SURFACE[name]!, unresolved: false };
  }
  return null;
}

function selectorText(rule: Rule): string {
  return generate(rule.prelude);
}

export function planRenames(css: string, rootPx: number): Rename[] {
  const ast = parse(css, { positions: true });
  const sizes = new Map<string, string>();
  walk(ast, {
    visit: 'Rule',
    enter(rule: Rule) {
      const sel = selectorText(rule);
      walk(rule.block, {
        visit: 'Declaration',
        enter(d: Declaration) {
          if (d.property === 'font-size') sizes.set(sel, generate(d.value));
        },
      });
    },
  });
  const sizeFor = (sel: string): string | undefined => {
    if (sizes.has(sel)) return sizes.get(sel);
    const base = sel.replace(/:[a-z-]+(\(.*\))?$/, '');
    let bestKey: string | undefined;
    for (const key of sizes.keys()) {
      if (
        isPrefixOf(base, key) &&
        (bestKey === undefined || key.length > bestKey.length)
      )
        bestKey = key;
    }
    return bestKey === undefined ? undefined : sizes.get(bestKey);
  };
  const out: Rename[] = [];
  walk(ast, {
    visit: 'Rule',
    enter(rule: Rule) {
      const sel = selectorText(rule);
      const hover = /:hover/.test(sel);
      const size = sizeFor(sel);
      const band = size === undefined ? null : bandFromSize(size, rootPx);
      walk(rule.block, {
        visit: 'Declaration',
        enter(d: Declaration) {
          walk(d.value as CssNode, {
            visit: 'Function',
            enter(fn: FunctionNode) {
              if (fn.name !== 'var') return;
              const first = fn.children.first;
              if (!first || first.type !== 'Identifier') return;
              const t = target(first.name, d.property, band, hover);
              if (!t) return;
              out.push({
                property: d.property,
                from: first.name,
                to: t.to,
                band: isColor(d.property) ? band : null,
                unresolved: t.unresolved,
                line: fn.loc?.start.line ?? d.loc?.start.line ?? 0,
              });
            },
          });
        },
      });
    },
  });
  return out;
}

function replaceVarName(line: string, from: string, to: string): string {
  const exact = `var(${from})`;
  if (line.includes(exact)) return line.replace(exact, `var(${to})`);
  const fallback = `var(${from},`;
  if (line.includes(fallback)) return line.replace(fallback, `var(${to},`);
  return line;
}

export function rewriteCss(
  css: string,
  rootPx: number
): { out: string; unresolved: Unresolved[] } {
  const renames = planRenames(css, rootPx);
  const lines = css.split('\n');
  const unresolved: Unresolved[] = [];
  for (const r of renames) {
    const i = r.line - 1;
    lines[i] = replaceVarName(lines[i]!, r.from, r.to);
    if (r.unresolved) unresolved.push({ line: r.line, text: lines[i]!.trim() });
  }
  return { out: lines.join('\n'), unresolved };
}

// Style objects and template strings in TSX: `color: 'var(--tk-muted-text)'`.
// The band comes from a `fontSize` key in the same object literal when there
// is one; otherwise the rename is listed as unresolved with the meta/small
// default, exactly like CSS.
export function renameInTsx(source: string): {
  out: string;
  unresolved: Unresolved[];
} {
  const unresolved: Unresolved[] = [];
  const lines = source.split('\n');
  const objectBand = (i: number): Band | null => {
    for (
      let j = Math.max(0, i - 6);
      j <= Math.min(lines.length - 1, i + 6);
      j++
    ) {
      const m = /fontSize:\s*['"`]([^'"`]+)['"`]/.exec(lines[j]!);
      if (m) return bandFromSize(m[1]!, 16);
    }
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i]!.replace(
      /(\b[a-zA-Z-]+)\s*:\s*(['"`])([^'"`]*var\(--[a-z0-9-]+\)[^'"`]*)\2/g,
      (whole, key: string, q: string, value: string) => {
        const property = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
        const hover = false;
        const band = isColor(property) ? objectBand(i) : null;
        const next = value.replace(
          /var\((--[a-z0-9-]+)\)/g,
          (v, name: string) => {
            const t = target(name, property, band, hover);
            if (!t) return v;
            if (t.unresolved)
              unresolved.push({ line: i + 1, text: whole.trim() });
            return `var(${t.to})`;
          }
        );
        return `${key}: ${q}${next}${q}`;
      }
    );
  }
  return { out: lines.join('\n'), unresolved };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const rootPx = Number(/--root=(\d+)/.exec(args.join(' '))?.[1] ?? 16);
  for (const file of args.filter(a => !a.startsWith('--'))) {
    const src = readFileSync(file, 'utf8');
    const res = file.endsWith('.css')
      ? rewriteCss(src, rootPx)
      : renameInTsx(src);
    const changed = res.out !== src;
    if (changed)
      console.log(`${file}: ${write ? 'rewritten' : 'would rewrite'}`);
    for (const u of res.unresolved)
      console.log(`  UNRESOLVED ${file}:${u.line}  ${u.text}`);
    if (write && changed) writeFileSync(file, res.out);
  }
}
