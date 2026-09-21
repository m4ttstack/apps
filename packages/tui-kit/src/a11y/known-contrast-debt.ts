/**
 * Ledger of Button (intent, variant, scheme) rest-state cells that measure
 * below WCAG AA (4.5:1). The filled label now reads `--on-fill-<hue>`,
 * the better of white and the dark neutral (packages/tokens/src/values.ts),
 * which clears 4.5 for every hue except crimson: white measures 3.85 there
 * and the dark neutral 4.26, so crimson 9 is the floor no label choice
 * clears. Retuning the fill step away from Radix is a design decision
 * reserved for a human.
 *
 * RATCHET CONTRACT (enforced by Button.matrix.test.tsx, not here): an
 * entry's `measuredRatio` may only be REMOVED (the cell was fixed and now
 * clears 4.5) or IMPROVED (a smaller regression than recorded), never
 * silently worsened, and never used to admit a NEW below-floor cell. Adding
 * a new entry to widen coverage requires the same human sign-off as fixing
 * one; this file is a record of known debt, not an allowlist mechanism.
 */

export type ContrastScheme = "light" | "dark";
export type ButtonInteractionState = "rest";

export interface ContrastDebtEntry {
  variant: string;
  intent: string;
  scheme: ContrastScheme;
  state: ButtonInteractionState;
  measuredRatio: number;
  reason: string;
}

export const KNOWN_CONTRAST_DEBT: readonly ContrastDebtEntry[] = [
  {
    variant: "filled",
    intent: "bad",
    scheme: "light",
    state: "rest",
    measuredRatio: 4.26,
    reason:
      "Crimson 9 is the one hue no label clears 4.5 on: white measures 3.85 " +
      "and the dark neutral 4.26. The dark neutral is the better of the two " +
      "and the fill step is fixed by the spec, so this is the floor.",
  },
  {
    variant: "filled",
    intent: "bad",
    scheme: "dark",
    state: "rest",
    measuredRatio: 4.26,
    reason:
      "Crimson 9 is the one hue no label clears 4.5 on: white measures 3.85 " +
      "and the dark neutral 4.26. The dark neutral is the better of the two " +
      "and the fill step is fixed by the spec, so this is the floor.",
  },
];

export function contrastDebtKey(
  entry: Pick<ContrastDebtEntry, "variant" | "intent" | "scheme" | "state">,
): string {
  return `${entry.scheme}|${entry.variant}|${entry.intent}|${entry.state}`;
}

export const CONTRAST_DEBT_BY_KEY: ReadonlyMap<string, ContrastDebtEntry> = new Map(
  KNOWN_CONTRAST_DEBT.map((entry) => [contrastDebtKey(entry), entry]),
);

/**
 * Fill-against-surface cells under the 3:1 non-text bar (WCAG 1.4.11). Same
 * ratchet as the Button ledger above: an entry may be removed or improved,
 * never worsened, and never added to admit a new below-floor fill. Every
 * `measuredRatio` here is the worst of the four surfaces (`surface-4` in
 * both schemes, confirmed strictly descending by the ramp itself), so the
 * removal check in the matrix test only needs to run there.
 */
export interface FillContrastDebtEntry {
  hue: string;
  scheme: ContrastScheme;
  measuredRatio: number;
  reason: string;
}

export const KNOWN_FILL_DEBT: readonly FillContrastDebtEntry[] = [
  {
    hue: "ok",
    scheme: "light",
    measuredRatio: 2.83,
    reason: "teal 10 on surface-4; the row surfaces closer to white still clear 3.0",
  },
  {
    hue: "warn",
    scheme: "light",
    measuredRatio: 2.72,
    reason: "orange 10, worst on surface-4 at 2.72 and also under on surface-3 at 2.93; 11 reads brown, so the fill stays at 10 and a warn fill alone must not carry meaning on either row",
  },
  {
    hue: "cyan",
    scheme: "light",
    measuredRatio: 2.80,
    reason: "cyan 10 on surface-4; the row surfaces closer to white still clear 3.0",
  },
  {
    hue: "gold",
    scheme: "light",
    measuredRatio: 1.29,
    reason: "amber 9 against every light surface; amber has no step from 9 to 10 that clears 3.0 in light, already the ruleFill exception in packages/tokens/test/invariants.test.ts. Gold's real use is text, not fill.",
  },
  {
    hue: "accent",
    scheme: "dark",
    measuredRatio: 2.77,
    reason: "indigo 9 against the dark raised ground; 10 would drop the white label under 4.5, so Radix's step 9 wins",
  },
  {
    hue: "purple",
    scheme: "dark",
    measuredRatio: 2.79,
    reason: "purple 9 against the dark raised ground; 10 would drop the white label under 4.5, so Radix's step 9 wins",
  },
];

export function fillDebtKey(entry: Pick<FillContrastDebtEntry, "hue" | "scheme">): string {
  return `${entry.scheme}|${entry.hue}`;
}

export const FILL_DEBT_BY_KEY: ReadonlyMap<string, FillContrastDebtEntry> = new Map(
  KNOWN_FILL_DEBT.map((entry) => [fillDebtKey(entry), entry]),
);

/**
 * `--line-1` under the 3.0:1 non-text bar (WCAG 1.4.11). It carries the
 * `control` role, so it bounds a UI component and is held to that bar rather
 * than to a text bar.
 *
 * Keyed per surface, not per scheme: a control edge sits on whichever ground
 * its control sits on, and an entry for one surface must not excuse another.
 */
export interface LineContrastDebtEntry {
  scheme: "light" | "dark";
  surface: 1 | 2 | 3 | 4;
  measuredRatio: number;
  reason: string;
}

export const KNOWN_LINE_DEBT: readonly LineContrastDebtEntry[] = [
  {
    scheme: "light",
    surface: 1,
    measuredRatio: 1.91,
    reason:
      "slate 8 is Radix's border step, tuned to read as a rule rather than to bound a control against white; a light control edge that clears 3.0 would be darker than any border in the scheme",
  },
  {
    scheme: "light",
    surface: 2,
    measuredRatio: 1.82,
    reason: "slate 8 on the panel ground; same border step, one rung less headroom",
  },
  {
    scheme: "light",
    surface: 3,
    measuredRatio: 1.68,
    reason: "slate 8 on the page ground; same border step, two rungs less headroom",
  },
  {
    scheme: "light",
    surface: 4,
    measuredRatio: 1.56,
    reason: "slate 8 on the chrome ground, the tightest light surface a control sits on",
  },
  {
    scheme: "dark",
    surface: 4,
    measuredRatio: 2.82,
    reason: "slate 9 control edge against the dark raised ground; clears 3.0 on page, panels and cards",
  },
];

export function lineDebtKey(
  entry: Pick<LineContrastDebtEntry, "scheme" | "surface">,
): string {
  return `${entry.scheme}|line-1|${entry.surface}`;
}

export const LINE_DEBT_BY_KEY: ReadonlyMap<string, LineContrastDebtEntry> =
  new Map(KNOWN_LINE_DEBT.map((entry) => [lineDebtKey(entry), entry]));

/**
 * `--on-fill-<hue>` labels under the 4.5:1 text bar (WCAG 1.4.3). Unlike the
 * fill ledger above, this cell has no surface: the label sits directly on
 * the fill, so one ratio per hue/scheme is the whole cell. Same ratchet
 * contract.
 */
export interface OnFillContrastDebtEntry {
  hue: string;
  scheme: ContrastScheme;
  measuredRatio: number;
  reason: string;
}

export const KNOWN_ON_FILL_DEBT: readonly OnFillContrastDebtEntry[] = [
  {
    hue: "bad",
    scheme: "light",
    measuredRatio: 4.26,
    reason:
      "crimson 9 is the one hue no label clears 4.5 on: white measures 3.85 and the dark neutral 4.26, the better of the two and still the floor",
  },
  {
    hue: "bad",
    scheme: "dark",
    measuredRatio: 4.26,
    reason: "crimson 9 is the same hex in both schemes, so the on-fill shortfall is identical",
  },
];

export function onFillDebtKey(entry: Pick<OnFillContrastDebtEntry, "hue" | "scheme">): string {
  return `${entry.scheme}|${entry.hue}`;
}

export const ON_FILL_DEBT_BY_KEY: ReadonlyMap<string, OnFillContrastDebtEntry> = new Map(
  KNOWN_ON_FILL_DEBT.map((entry) => [onFillDebtKey(entry), entry]),
);

/**
 * `--text-<hue>-vivid` (Radix step 11, unconditional) carries two different
 * bars depending on how it is used: a status GLYPH reads it against 3.0
 * (WCAG 1.4.11) and always clears that everywhere, so the matrix asserts
 * 3.0 unconditionally with no ledger. Running status TEXT reads it against
 * 4.5 (WCAG 1.4.3), which step 11 only reliably clears on `surface-1`; on
 * darker surfaces it is ledgered per (hue, scheme, surface) rather than per
 * hue, because the same hue clears 4.5 on one surface and misses it on the
 * next. `accent` and `purple` clear 4.5 on every surface and have no entry.
 */
export interface VividTextContrastDebtEntry {
  hue: string;
  scheme: ContrastScheme;
  surface: 1 | 2 | 3 | 4;
  measuredRatio: number;
  reason: string;
}

export const KNOWN_VIVID_TEXT_DEBT: readonly VividTextContrastDebtEntry[] = [
  { hue: "ok", scheme: "light", surface: 2, measuredRatio: 4.33, reason: "teal 11 as text on surface-2. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as ok. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "ok", scheme: "light", surface: 3, measuredRatio: 4.01, reason: "teal 11 as text on surface-3. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as ok. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "ok", scheme: "light", surface: 4, measuredRatio: 3.73, reason: "teal 11 as text on surface-4. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as ok. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "warn", scheme: "light", surface: 2, measuredRatio: 4.28, reason: "orange 11 as text on surface-2. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as warn. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "warn", scheme: "light", surface: 3, measuredRatio: 3.96, reason: "orange 11 as text on surface-3. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as warn. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "warn", scheme: "light", surface: 4, measuredRatio: 3.69, reason: "orange 11 as text on surface-4. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as warn. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "gold", scheme: "light", surface: 2, measuredRatio: 4.38, reason: "amber 11 as text on surface-2. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as gold. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "gold", scheme: "light", surface: 3, measuredRatio: 4.05, reason: "amber 11 as text on surface-3. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as gold. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "gold", scheme: "light", surface: 4, measuredRatio: 3.77, reason: "amber 11 as text on surface-4. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as gold. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "cyan", scheme: "light", surface: 3, measuredRatio: 4.18, reason: "cyan 11 as text on surface-3. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as cyan. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "cyan", scheme: "light", surface: 4, measuredRatio: 3.89, reason: "cyan 11 as text on surface-4. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as cyan. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
  { hue: "bad", scheme: "light", surface: 4, measuredRatio: 4.41, reason: "crimson 11 as text on surface-4. Light has no middle text step for this hue: step 11 misses 4.5 on every surface and step 12 is a near-black tint that stops reading as bad. Status keeps its hue at this cost; the same value as a glyph clears its own 3.0 bar" },
];

export function vividTextDebtKey(
  entry: Pick<VividTextContrastDebtEntry, "hue" | "scheme" | "surface">,
): string {
  return `${entry.scheme}|${entry.hue}|${entry.surface}`;
}

export const VIVID_TEXT_DEBT_BY_KEY: ReadonlyMap<string, VividTextContrastDebtEntry> = new Map(
  KNOWN_VIVID_TEXT_DEBT.map((entry) => [vividTextDebtKey(entry), entry]),
);
