# Text and surface ramps

**Goal:** one text ramp and one surface ramp that a reader (human or model)
can pick from without judgment, where the wrong pick is either impossible or
loud.

**Status:** design. No code written against it yet.

## 1. What went wrong, with evidence

The review sheet shipped with `var(--muted)` as the text colour on eleven
rules. `--muted` (`#8990b3`) is a fill token; it measures about 3:1 on white
and fails AA for body text. The token that belongs there, `--muted-text`
(`#565d80`), measures 6.42:1.

Nothing failed. The rule exists only as prose in a test comment:

> only the explicit `--muted-text` alias carries the AA-compliant value, for
> text-role `color:` declarations

A comment cannot fail a build, and the token whose name a writer reaches for
first is the one that is wrong.

A measured audit of the rendered sheet then found three further failures that
a judgment pass had missed (`mr-open` 3.03:1, `all · none` 3.13:1, the
Important tier pill 4.01:1) and zero in dark. The measurement took one pass;
the judgment pass had already been run twice and was confident.

### The size trap

Chat looked bad while passing. Its dim text measures 4.95:1, above the 4.5
bar. The problem is that the platform base font size is `13.5px`
(`packages/tokens/src/values.ts`), and chat's secondary text renders at
9.4px to 11.2px. WCAG's 4.5:1 bar assumes roughly 16px body text.

**A ramp certified only against AA reproduces chat.** Any design here has to
couple contrast to size, not just to surface.

Not traced: the exact rule chain from the 13.5px base to 9.44px rendered
text. The base and the rendered sizes are measured; the steps between are
not.

## 2. What already exists

Do not reinvent these.

| Layer | Has | Quality |
| --- | --- | --- |
| `packages/tokyo` | ten-shade Mantine tuples per hue (`ramps.ts`) | good, and a different axis from this problem |
| `packages/ui` (app-kit) | `--ui-bg-1..4` numbered surfaces, `--ui-base-*` / `--ui-*` two-layer remap, `.ui-base-surfaces` restore, `bg-level-*` Mantine colors | the right model |
| `packages/tui-kit` | `--type-display/title/body/meta/small/micro` | ordered type scale worth keeping |
| `packages/tokens` | `invariants.test.ts` luminance ordering | the right kind of test, wrong coverage |

app-kit's surface model is what this spec generalises: numbered slots, a
kit-owned base layer an app may remap, and a one-class restore.

## 3. What is actually broken

Measured, not asserted.

- **`--ui-text-muted` and `--ui-text-dimmed` are the same colour** in both
  schemes (`#565d80` / `#969ec2`). Three names, two values.
- **`--ui-text-gray` is the loudest step** (`#222` / `#e3e7f6`). The name
  says nothing about that.
- **`bg-1..4` is numbered but not monotonic.** Levels 1 to 3 step away from
  the page; level 4 reverses (darkest in light, lightest in dark). This is
  deliberate and documented, but it means "higher is more raised" is false,
  which is exactly the inference a reader makes.
- **No contrast test exists in app-kit.**
- **tui-kit surfaces are six adjectives** (`bg`, `panel`, `card`, `inset`,
  `overlay`, `chrome`) with no ordering in the names. Their real ladder is
  discoverable only by computing luminance, which is how the dark-surface
  retune first inverted it and tripped the tokens invariants.
- **tui-kit text is nine adjectives** (`fg`, `muted`, `mutedText`,
  `mutedOnCard`, plus five `*Text` hue companions).

## 4. Design

### 4.1 Two ramps, numbered, one rule each

**Text** ... only valid in `color:`.

| Token | Role |
| --- | --- |
| `--text-1` | body and titles |
| `--text-2` | secondary: fix gists, details, subtitles |
| `--text-3` | tertiary: small-caps labels, meta |
| `--text-disabled` | inert controls only, named so it is not reached for casually |

**Surface** ... only valid in `background:`.

| Token | Role |
| --- | --- |
| `--surface-1` | page |
| `--surface-2` | panel, inset |
| `--surface-3` | card |
| `--surface-4` | raised: docks, popovers, menus |

Surfaces are monotonic by elevation in both schemes. app-kit's level 4
contrast step becomes its own token (`--surface-accent`) rather than a
number that reverses direction, so the numbers never lie.

### 4.2 The guarantee that removes judgment

**Every step of the text ramp clears its bar on every surface of the surface
ramp, in both schemes.** A failing value is not in the ramp. `#8990b3` would
not appear in `--text-*` at all; it is a fill.

### 4.3 Bars are size-aware

This is the part that answers chat. The bar a step must clear is set by the
smallest type step it is approved for, not by WCAG's 16px assumption:

| Approved at | Bar |
| --- | --- |
| `--type-body` and larger | 4.5:1 |
| `--type-meta` | 5.5:1 |
| `--type-small`, `--type-micro` | 7:1 |

A step that only clears 4.5 is not approved below body size, and the lint
says so. This is what a colour-only ramp cannot express and why chat passed
while reading badly.

### 4.4 The surface sets the text context

A surface class redefines the text ramp for its subtree:

```css
.surface-3 {
  background: var(--surface-3);
  --text-2: <value tuned against surface-3>;
}
```

A component never names "muted on card". It says `--text-2` and the surface
resolves it. This deletes `mutedOnCard`, `edgeOnCard`, `softOnCard`,
`controlEdgeOnCard` and the whole `--gate-*` re-alias block as concepts.

### 4.5 Namespaces that make the mistake visible

- `--text-*` ... `color:` only
- `--surface-*` ... `background:` only
- `--line-*` ... borders only
- `--fill-*` ... raw hues for dots, washes, chips, shapes

`color: var(--fill-warn)` then reads as wrong on sight. Tinted text takes
surface-corrected roles (`--text-accent`, `--text-ok`, `--text-warn`,
`--text-danger`), which retires the `accent` vs `accentText` decision.

## 5. Tests

1. **Generated contrast matrix.** Every `--text-N` x every `--surface-N` x
   both schemes x its size bar, asserted at build. Extends the existing
   `packages/tokens/test/invariants.test.ts`.
2. **Lint: `color:` may only reference `--text-*`.** One rule; it catches
   all eleven original mistakes mechanically.
3. **Rendered contrast gate.** The audit written during the review-gate work
   walks rendered text, resolves the real painted background through
   translucent layers, and reports anything under its bar. It found all
   three misses a judgment pass left. Worth running per app in CI, and it is
   the only one of the three that catches a wrong *background* pairing.

Test 3 needs the `color(srgb 0-1)` parsing fix: Chrome serves both
`rgb()` (0-255) and `color(srgb ...)` (0-1), and reading the latter as
0-255 reports dark text on light backgrounds as failing. That bug produced
false findings twice during this investigation.

## 6. Blast radius

Measured with grep over `apps/` and `packages/`, excluding generated output.

| Token | Uses |
| --- | --- |
| `--muted-text` | 765 |
| `--fg` | 348 |
| `--muted` | 154 |
| `--panel` | 76 |
| `--card` | 39 |
| `--bg` | 38 |
| `--chrome` | 5 |
| `--text-muted-on-card` | 3 |
| `--surface-inset` | 1 |
| `--ui-bg-1..4` | 81 |
| `--ui-text-muted/gray/dimmed` | 16 |

Most of the volume is `--muted-text` and `--fg`, which map one-to-one onto
`--text-2` and `--text-1`. The genuinely hand-audited work is the 154
`--muted` uses, where each has to be classified as text (becomes `--text-*`)
or fill (becomes `--fill-*`). That classification is the same judgment that
failed before, so it runs with the lint and the rendered gate already in
place, not before them.

## 7. Migration

1. Land the three tests against today's tokens. They will fail; record the
   failures as the baseline ledger, the way
   `known-contrast-debt.ts` already does for Button.
2. Add the new ramp alongside the old names, with the old names aliased to
   their new equivalents. Nothing breaks.
3. Migrate per package, cheapest first: tui-kit, then board (largest
   consumer), then the Mantine apps through app-kit's slots.
4. Classify the 154 `--muted` uses under the lint.
5. Delete the aliases one release later.

Order matters: the tests land first, so the migration is verified as it
happens rather than eyeballed after. The original defect was shipped by a
pass that looked instead of measured.
