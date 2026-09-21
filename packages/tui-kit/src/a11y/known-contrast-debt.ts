/**
 * Ledger of Button (intent, variant, scheme) rest-state cells that measure
 * below WCAG AA (4.5:1). Every cell is a Radix step 9 or 10 solid fill
 * carrying the white label Radix's own contract specifies for that step:
 * the scale is designed for a white label on its solid steps, and the
 * mid-luminance hues (teal, orange, cyan, crimson) land between 3:1 and
 * 4.5:1 with it. Retuning those fills away from Radix is a design decision
 * reserved for a human.
 *
 * RATCHET CONTRACT (enforced by Button.matrix.test.tsx, not here): an
 * entry's `measuredRatio` may only be REMOVED (the cell was fixed and now
 * clears 4.5) or IMPROVED (a smaller regression than recorded) — never
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
  { variant: "filled", intent: "ok", scheme: "light", state: "rest", measuredRatio: 3.46, reason: "white label on teal 10, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "warn", scheme: "light", state: "rest", measuredRatio: 3.33, reason: "white label on orange 10, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "cyan", scheme: "light", state: "rest", measuredRatio: 3.42, reason: "white label on cyan 10, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "bad", scheme: "light", state: "rest", measuredRatio: 3.85, reason: "white label on crimson 9, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "ok", scheme: "dark", state: "rest", measuredRatio: 3.07, reason: "white label on teal 9, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "warn", scheme: "dark", state: "rest", measuredRatio: 2.97, reason: "white label on orange 9, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "cyan", scheme: "dark", state: "rest", measuredRatio: 3.0, reason: "white label on cyan 9, Radix's own label choice for the solid step" },
  { variant: "filled", intent: "bad", scheme: "dark", state: "rest", measuredRatio: 3.85, reason: "white label on crimson 9, Radix's own label choice for the solid step" },
];

export function contrastDebtKey(
  entry: Pick<ContrastDebtEntry, "variant" | "intent" | "scheme" | "state">,
): string {
  return `${entry.scheme}|${entry.variant}|${entry.intent}|${entry.state}`;
}

export const CONTRAST_DEBT_BY_KEY: ReadonlyMap<string, ContrastDebtEntry> = new Map(
  KNOWN_CONTRAST_DEBT.map((entry) => [contrastDebtKey(entry), entry]),
);
