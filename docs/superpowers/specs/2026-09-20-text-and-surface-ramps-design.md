# Text and surface ramps

**Goal:** one surface ramp, one text ramp, one type ramp and one palette that
a reader (human or model) can pick from without judgment, where the wrong
pick is either impossible or loud.

**Status:** design, approved. Values settled in `~/Documents/mattstack
colors.pen`. Implementation sequenced in §9.

**Supersedes:** the first draft of this file, which carried two claims the
math later disproved. Both are corrected here and called out in §10.

## 1. What went wrong, with evidence

The review sheet shipped with `var(--muted)` as the text colour on eleven
rules. `--muted` (`#8990b3`) is a fill token measuring 2.85:1 against the
worst light surface; it fails AA for body text. `--muted-text` (`#565d80`)
is the token that belongs there.

Nothing failed. The rule existed only as prose in a test comment:

> only the explicit `--muted-text` alias carries the AA-compliant value, for
> text-role `color:` declarations

A comment cannot fail a build, and the token a writer reaches for first is
the wrong one.

A measured audit of the rendered sheet then found three more below their bar
(`mr-open` 3.03, `all · none` 3.13, the Important tier pill 4.01) and zero in
dark. The measurement took one pass. The judgment pass had already run twice
and was confident both times.

### 1.1 The size trap

Chat looked bad while passing. Its dim text measures 4.95:1, above the 4.5
bar. The platform's root is 17px, body renders at 14.45px, and chat's
secondary text lands at 10.5-12px. WCAG's 4.5:1 assumes roughly 16px body.

**A ramp certified only against AA reproduces chat.** Contrast has to be
coupled to size, not just to surface.

## 2. What already exists

Do not reinvent these.

| Layer | Has | Quality |
| --- | --- | --- |
| `packages/tokyo` | ten-shade Mantine tuples per hue (`ramps.ts`) | hand-generated; see MAT-421 |
| `packages/ui` (app-kit) | `--ui-bg-1..4`, a `--ui-base-*` / `--ui-*` two-layer remap, `.ui-base-surfaces` restore, `mountMattstackApp` | the right model |
| `packages/tui-kit` | `--type-display/title/body/meta/small/micro` | ordered type scale worth keeping |
| `packages/tokens` | `invariants.test.ts` luminance ordering | the right kind of test, wrong coverage |
| `packages/tui-kit` | `Button.matrix.test.tsx` + `known-contrast-debt.ts` | a working contrast gate with a ratchet |

`packages/tokyo/src/tokyo-theme.css` remaps app-kit's live slots onto
tui-kit's tokens (`--ui-bg-1: var(--tk-bg)`), which is why every app
ultimately reads from `packages/tokens`. Tokyo is the single bridge, so one
ramp change propagates everywhere.

That remap is also why `--ui-text-muted` and `--ui-text-dimmed` are the same
colour: both point at `--tk-muted-text`. Two names, one value.

## 3. Surfaces

**The rule: `surface-1` is the background with the highest contrast against
the default text, and each step after it has less.**

Scheme-independent and checkable by sorting. The number tells you your
headroom: `surface-1` is always the safest ground for text, `surface-4`
always the tightest. The columns mirror because the rule is about contrast,
not lightness.

| | light | vs text | dark | vs text | role |
| --- | --- | --- | --- | --- | --- |
| `surface-1` | `#ffffff` | 15.91 | `#101016` | 15.37 | light: sheets, cards. dark: deepest wells |
| `surface-2` | `#fbfbfc` | 15.38 | `#16161e` | 14.58 | light: panels. dark: the page |
| `surface-3` | `#f7f8fa` | 14.97 | `#1a1c28` | 13.72 | light: the page. dark: panels |
| `surface-4` | `#f3f4f7` | 14.47 | `#1e2030` | 13.05 | light: rows, sidebar. dark: sheets, cards |

Roles land on different numbers per scheme by design. Components never name
a number; see §4. Seven of the eight values ship today. Only dark
`surface-1` (`#101016`) is new, and nothing uses it, so no app repaints.

## 4. Two layers

The ramp is declared once per scheme and **never referenced by a
component**. A semantic layer sits on top, pointing at ramp steps, and its
mapping is free to differ per scheme.

```css
:root {
  --surface-1: #ffffff;  --surface-2: #fbfbfc;
  --surface-3: #f7f8fa;  --surface-4: #f3f4f7;

  --card: var(--surface-1);   --panel:  var(--surface-2);
  --page: var(--surface-3);   --chrome: var(--surface-4);
}
:root.dark {
  --surface-1: #101016;  --surface-2: #16161e;
  --surface-3: #1a1c28;  --surface-4: #1e2030;

  --card: var(--surface-4);   --panel:  var(--surface-3);
  --page: var(--surface-2);   --chrome: var(--surface-3);
  --well: var(--surface-1);
}
```

Components write `--card`. Only the tokens file writes `--surface-N`. This
is what lets the ramp be ordered by contrast while `--card` still means one
thing everywhere, and it deletes `mutedOnCard`, `edgeOnCard`,
`controlEdgeOnCard`, `softOnCard` and the whole `--gate-*` re-alias block as
concepts.

**Open:** `--chrome` and `--panel` are the same value in dark today, so both
point at `surface-3`. Either dark chrome gets its own value or the two
tokens merge. Decide before implementing.

## 5. Text

Four values. `text-1` is primary and safe at every size. The rest are one
secondary role resolved against the size band it serves: the quietest value
that still clears that band's bar.

| | light | worst | dark | worst | bar | serves |
| --- | --- | --- | --- | --- | --- | --- |
| `text-1` | `#222222` | 14.47 | `#e3e7f6` | 13.05 | — | every size |
| `text-2` | `#666e97` | 4.50 | `#7c86b3` | 4.54 | 4.5 | display, title, body |
| `text-3` | `#596084` | 5.57 | `#8d96bd` | 5.54 | 5.5 | meta |
| `text-4` | `#4b5170` | 7.05 | `#a3aac9` | 7.01 | 7.0 | small, micro |

Every value is solved against all four surfaces and carries its worst case,
so it is safe on any of them.

## 6. Type

Six steps named by role, measured live at a 17px root. Each names the
contrast bar any secondary text must clear at that size. **This column is
the link the old system lacked:** nothing stopped a colour tuned for body
copy being used on 10.54px text.

| step | px | weight | line | bar |
| --- | --- | --- | --- | --- |
| `display` | 17 | 700 | 1.25 | 4.5 |
| `title` | 15.3 | 600 | 1.3 | 4.5 |
| `body` | 14.45 | 400 | 1.5 | 4.5 |
| `meta` | 13.26 | 400 | 1.45 | 5.5 |
| `small` | 11.9 | 400 | 1.4 | 7.0 |
| `micro` | 10.54 | 500 | 1.35 | 7.0 |

The six semantic steps sit on 22 ad-hoc primitives (`sm/md/lg/xl`,
`px9..px13`, `rem60..rem105`, some differing by half a pixel). Collapsing
those is out of scope here but worth a follow-up.

## 7. Palette

Three values per hue at three bars. Because text always needs more contrast
than a shape, the three progress in one direction in both schemes, by
construction rather than by hand: light gets darker, dark gets lighter.

| hue | light fill / body / small | dark fill / body / small |
| --- | --- | --- |
| accent | `#7380ff` `#495aff` `#0e25ff` | `#4758f4` `#6e7cf7` `#9ca5f9` |
| ok | `#00a170` `#008059` `#005e42` | `#277860` `#319879` `#3ec098` |
| bad | `#ff4284` `#de004e` `#a7003b` | `#d30c52` `#f4417f` `#f888af` |
| warn | `#d67400` `#aa5c00` `#7e4400` | `#955f1f` `#bd7827` `#dc9f56` |
| purple | `#af6aff` `#9337ff` `#6900e3` | `#8c38ef` `#a867f3` `#c498f7` |
| cyan | `#009bb6` `#007b91` `#005b6b` | `#00768b` `#0095b0` `#00bbdd` |

Fill takes the 3:1 graphics minimum; text takes 4.5 at body and 7 at small.
A fill is never a text colour: `--fill-accent` and `--text-accent` say which
is which, retiring the `accent` versus `accentText` guesswork.

### 7.1 Dark hue correction

Light was relocked to the arcade palette; dark still carries the original
Tokyo Night editor colours, so the schemes disagree on what each hue **is**.
Measured hue deltas: ok 73°, accent 13°, cyan 13°, bad 10°, purple 7°,
warn 4°. ok is teal-green by day and yellow-green by night — a different
colour, not a lightness variant.

The values in §7 hold the light hue angle in both schemes. This is what
MAT-421 blocks: changing `TOKENS.dark.hue.*` breaks the hand-written ramps.

**Open:** `fill-ok` in dark (`#277860`) is deep, because 3:1 is a low bar on
a near-black page. If dark fills read muted in practice, raise the fill bar
to 4:1 rather than hand-picking values.

## 8. Namespaces and providers

### 8.1 Namespaces

- `--text-*` ... `color:` only
- `--surface-*` ... `background:` only, and only in the tokens file
- `--line-*` ... borders only
- `--fill-*` ... dots, washes, chips, shapes

`color: var(--fill-warn)` then reads as wrong on sight.

### 8.2 Providers

`mountMattstackApp` already binds the Tokyo theme into `MantineProvider`, so
Mantine apps get their tokens pre-bound. tui-kit does not: it exports
`SoribashiProvider` and `tuiTheme` separately, and every consumer must do a
two-step dance in two different scopes:

```ts
registerTheme(tuiTheme);              // module scope, for style-prop resolvers
<SoribashiProvider theme={tuiTheme}>  // context, for useTheme()
```

Getting one of the two right fails in a way that is hard to spot. tui-kit
gains a bound provider mirroring `mountMattstackApp`, doing both in one.

`packages/tokens` stays pure values plus codegen and takes no React,
Mantine or soribashi dependency. It generates *into* the kits; inverting
that so the lowest package depends on the kits above it is not worth one
import site.

## 9. Verification and sequencing

Three mechanisms, in the order they must land:

1. **Generated ramps (MAT-421).** Blocks everything in §7.1. Raw
   `@mantine/colors-generator` output is unusable: measured across all six
   hues, only 2 of 8 seeds land on the index Mantine reads as primary, so
   `filled`/`outline`/`text` would render colours nobody chose (`#29feb6`
   in place of `#00c287`). The codegen must re-anchor and then assert, per
   ramp, failing the build rather than emitting.
2. **Bound provider (§8.2).** Then the storybook can be built on the real
   providers rather than a hand-wired approximation.
3. **Storybook (MAT-419).** Two clearly separated halves: a reference
   catalogue rendering the ramps from the imported tokens with contrast
   computed at render time, and a specimen wall covering both kits, using
   the bound providers, with `parameters.a11y.test = 'error'` per story.
   Needs one glob added to `.storybook/main.ts`; the `scheme` toolbar
   already gives both schemes.
4. **Contrast gate.** Extends the existing `Button.matrix.test.tsx`
   browser-vitest pattern and its `known-contrast-debt.ts` ratchet to cover
   every text step against every surface in both schemes. Not a Storybook
   test-runner: there is none installed, and the vitest browser project is
   already in CI.
5. **Lint (MAT-420).** Lands BEFORE the apps-wide migration. Roughly 154
   `--muted` uses must be classified as text or fill by hand, and that is
   the same judgment that failed the first time.

Migration then proceeds per package, cheapest first, with old names aliased
to new for one release. `--muted-text` (765 uses) and `--fg` (348) map
one-to-one; the hand-audited work is the 154 `--muted` uses.

### 9.1 A measurement bug to avoid

Chrome serves both `rgb()` (0-255) and `color(srgb r g b)` (0-1). Reading
the latter as 0-255 reports dark text on light backgrounds as failing. That
bug produced false findings twice while this was being investigated. Any
contrast tool here must normalise by syntax, not by guessing at magnitude,
and must composite translucent layers to find the real painted background.

## 10. Corrections to the first draft

- **`text-3` was specified as both quieter and higher-contrast.** Those
  contradict: quieter means less contrast, smaller type needs more. The
  solver returned a value darker than `text-2`, exposing it. Resolved in §5
  by making the ramp size-banded rather than a loudness ladder.
- **The platform base was given as 13.5px.** The `--font-size-base` token
  does say `13.5px`, but the live root is 17px and body renders at 14.45px.
  §6 uses measured values.
