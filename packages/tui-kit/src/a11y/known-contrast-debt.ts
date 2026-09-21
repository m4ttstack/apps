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
    reason: "orange 10 on surface-4; 11 reads brown, so the fill stays at 10 and a warn fill alone must not carry meaning on the darkest row",
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
  {
    hue: "line-1",
    scheme: "dark",
    measuredRatio: 2.82,
    reason: "slate 9 control edge against the dark raised ground; clears 3.0 on page, panels and cards",
  },
];

export function fillDebtKey(entry: Pick<FillContrastDebtEntry, "hue" | "scheme">): string {
  return `${entry.scheme}|${entry.hue}`;
}

export const FILL_DEBT_BY_KEY: ReadonlyMap<string, FillContrastDebtEntry> = new Map(
  KNOWN_FILL_DEBT.map((entry) => [fillDebtKey(entry), entry]),
);

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
  { hue: "ok", scheme: "light", surface: 2, measuredRatio: 4.33, reason: "teal 11 as text on surface-2; still clears the 3.0 glyph bar" },
  { hue: "ok", scheme: "light", surface: 3, measuredRatio: 4.01, reason: "teal 11 as text on surface-3; still clears the 3.0 glyph bar" },
  { hue: "ok", scheme: "light", surface: 4, measuredRatio: 3.73, reason: "teal 11 as text on surface-4; still clears the 3.0 glyph bar" },
  { hue: "warn", scheme: "light", surface: 2, measuredRatio: 4.28, reason: "orange 11 as text on surface-2; still clears the 3.0 glyph bar" },
  { hue: "warn", scheme: "light", surface: 3, measuredRatio: 3.96, reason: "orange 11 as text on surface-3; still clears the 3.0 glyph bar" },
  { hue: "warn", scheme: "light", surface: 4, measuredRatio: 3.69, reason: "orange 11 as text on surface-4; still clears the 3.0 glyph bar" },
  { hue: "gold", scheme: "light", surface: 2, measuredRatio: 4.38, reason: "amber 11 as text on surface-2; still clears the 3.0 glyph bar" },
  { hue: "gold", scheme: "light", surface: 3, measuredRatio: 4.05, reason: "amber 11 as text on surface-3; still clears the 3.0 glyph bar" },
  { hue: "gold", scheme: "light", surface: 4, measuredRatio: 3.77, reason: "amber 11 as text on surface-4; still clears the 3.0 glyph bar" },
  { hue: "cyan", scheme: "light", surface: 3, measuredRatio: 4.18, reason: "cyan 11 as text on surface-3; still clears the 3.0 glyph bar" },
  { hue: "cyan", scheme: "light", surface: 4, measuredRatio: 3.89, reason: "cyan 11 as text on surface-4; still clears the 3.0 glyph bar" },
  { hue: "bad", scheme: "light", surface: 4, measuredRatio: 4.41, reason: "crimson 11 as text on surface-4; still clears the 3.0 glyph bar" },
];

export function vividTextDebtKey(
  entry: Pick<VividTextContrastDebtEntry, "hue" | "scheme" | "surface">,
): string {
  return `${entry.scheme}|${entry.hue}|${entry.surface}`;
}

export const VIVID_TEXT_DEBT_BY_KEY: ReadonlyMap<string, VividTextContrastDebtEntry> = new Map(
  KNOWN_VIVID_TEXT_DEBT.map((entry) => [vividTextDebtKey(entry), entry]),
);
