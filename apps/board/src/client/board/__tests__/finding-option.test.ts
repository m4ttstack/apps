import { describe, expect, test } from 'bun:test';
import { parseFindingOption } from '../finding-option.ts';

describe('parseFindingOption', () => {
  test('parses tier, title, anchor, fix', () => {
    expect(
      parseFindingOption({
        value: 'f3',
        label: '[Minor] Em dash in the new describe title',
        description:
          'workflow.integration.test.ts:12 · use a hyphen; change both siblings · kind:nitpick',
      })
    ).toEqual({
      id: 'f3',
      tier: 'Minor',
      title: 'Em dash in the new describe title',
      anchor: 'workflow.integration.test.ts:12',
      fix: 'use a hyphen; change both siblings',
      kind: 'nitpick',
    });
  });

  test('description without separator that looks like a path is an anchor', () => {
    const parsed = parseFindingOption({
      value: 'f9',
      label: '[Important] Evidence section is empty',
      description: 'apps/webapp/src/services/api.tsx',
    });
    expect(parsed?.anchor).toBe('apps/webapp/src/services/api.tsx');
    expect(parsed?.fix).toBeUndefined();
  });

  test('non-finding options give null', () => {
    expect(parseFindingOption('approve')).toBeNull();
    expect(
      parseFindingOption({ value: 'Minor', label: 'Minor (4)' })
    ).toBeNull();
  });
});
