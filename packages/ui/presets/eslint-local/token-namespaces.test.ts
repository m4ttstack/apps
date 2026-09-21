import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { classifyTokenUse } from './token-namespaces.js';
import tokenNamespacesTsx from './token-namespaces-tsx.js';

describe('classifyTokenUse', () => {
  it('lets text tokens colour text', () => {
    expect(classifyTokenUse('color', '--text-3')).toBeNull();
    expect(classifyTokenUse('color', '--text-ok-small')).toBeNull();
  });

  it('rejects text tokens as backgrounds and fills as text', () => {
    expect(classifyTokenUse('background', '--text-3')).toMatch(/--text-\* is for color/);
    expect(classifyTokenUse('color', '--fill-warn')).toMatch(/--fill-\* is never a text colour/);
  });

  it('lets surfaces be backgrounds and fills, nothing else', () => {
    expect(classifyTokenUse('background', '--surface-card')).toBeNull();
    expect(classifyTokenUse('background-color', '--surface-wash-fg-8')).toBeNull();
    expect(classifyTokenUse('fill', '--surface-panel')).toBeNull();
    expect(classifyTokenUse('color', '--surface-card')).toMatch(/--surface-\* is for background/);
    expect(classifyTokenUse('border-color', '--surface-card')).toMatch(/--surface-\* is for background/);
  });

  it('rejects the numeric ramp steps everywhere', () => {
    expect(classifyTokenUse('background', '--surface-1')).toMatch(/only the tokens file/);
    expect(classifyTokenUse('border', '--line-2')).toMatch(/only the tokens file/);
  });

  it('lets border tokens draw borders, outlines and scrollbars', () => {
    expect(classifyTokenUse('border', '--border')).toBeNull();
    expect(classifyTokenUse('border-top-color', '--border-soft')).toBeNull();
    expect(classifyTokenUse('outline-color', '--border-control')).toBeNull();
    expect(classifyTokenUse('scrollbar-color', '--border-on-card')).toBeNull();
    expect(classifyTokenUse('background', '--border-soft')).toMatch(/--border-\* is for border/);
  });

  it('ignores alias declarations, line-height and unrelated tokens', () => {
    expect(classifyTokenUse('--gate-muted', '--text-muted-on-card')).toBeNull();
    expect(classifyTokenUse('line-height', '--line-height-base')).toBeNull();
    expect(classifyTokenUse('color', '--muted')).toBeNull();
    expect(classifyTokenUse('color', '--accent')).toBeNull();
  });
});

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2023, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

// RuleTester.run creates its own describe/it blocks from the vitest globals
// (`globals: true` in packages/ui/vitest.config.ts); wrapping it in an it()
// makes vitest throw "Calling the suite function inside test function is
// not allowed", so the run call sits directly in the describe body.
describe('local/token-namespaces (tsx)', () => {
  tester.run('token-namespaces', tokenNamespacesTsx, {
    valid: [
      { code: 'const s = { color: "var(--text-3)", background: "var(--card)" };' },
      { code: 'const s = { borderColor: `1px solid var(--border-soft)` };' },
      { code: 'const s = { "--gate-muted": "var(--text-muted-on-card)" };' },
    ],
    invalid: [
      { code: 'const s = { color: "var(--fill-warn)" };', errors: [{ messageId: 'misuse' }] },
      { code: 'const s = { background: "var(--surface-2)" };', errors: [{ messageId: 'misuse' }] },
      { code: 'const s = { backgroundColor: `var(--text-2)` };', errors: [{ messageId: 'misuse' }] },
    ],
  });
});
