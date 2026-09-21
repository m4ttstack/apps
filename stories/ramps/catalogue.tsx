import type { CSSProperties, ReactNode } from 'react';

import { TOKENS, type ColorScheme } from '@mattstack/tokens';
import { contrastRatio } from '@mattstack/tokens/color-math';

export type SchemeName = 'light' | 'dark';
export const SCHEMES: readonly SchemeName[] = ['light', 'dark'];

export function scheme(name: SchemeName): ColorScheme {
  return TOKENS[name];
}

export function Ratio({
  fg,
  bg,
  bar,
}: {
  fg: string;
  bg: string;
  bar?: number;
}) {
  const ratio = contrastRatio(fg, bg);
  const ok = bar === undefined || ratio >= bar;
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        color: ok ? 'inherit' : '#de004e',
      }}
    >
      {ratio.toFixed(2)}
      {bar !== undefined ? ` / ${bar.toFixed(1)}` : ''}
    </span>
  );
}

export function Swatch({
  hex,
  label,
  textOn,
  children,
  style,
}: {
  hex: string;
  label: string;
  textOn: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: hex,
        color: textOn,
        padding: 12,
        borderRadius: 6,
        fontFamily: TOKENS.font.sans,
        fontSize: 13,
        display: 'grid',
        gap: 4,
        ...style,
      }}
    >
      <strong>{label}</strong>
      <code>{hex}</code>
      {children}
    </div>
  );
}

export function SchemeColumn({
  name,
  children,
}: {
  name: SchemeName;
  children: ReactNode;
}) {
  const t = scheme(name);
  return (
    <section
      style={{
        background: t.surface.bg,
        color: t.text.fg,
        padding: 20,
        borderRadius: 10,
        display: 'grid',
        gap: 12,
        alignContent: 'start',
        fontFamily: TOKENS.font.sans,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 14,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        {name}
      </h3>
      {children}
    </section>
  );
}

export function TwoSchemes({
  render,
}: {
  render: (name: SchemeName) => ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {SCHEMES.map(name => (
        <SchemeColumn key={name} name={name}>
          {render(name)}
        </SchemeColumn>
      ))}
    </div>
  );
}
