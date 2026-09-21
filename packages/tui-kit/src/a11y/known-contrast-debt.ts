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
