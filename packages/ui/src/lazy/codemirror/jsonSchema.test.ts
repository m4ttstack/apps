import { CompletionContext } from '@codemirror/autocomplete';
import { json } from '@codemirror/lang-json';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import {
  jsonDiagnostics,
  jsonSchemaCompletion,
  nodeAtPath,
} from './jsonSchema';

const SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      category: { type: 'string' },
      owner: { type: 'string', const: 'human' },
      provider: { enum: ['gitlab', 'github'] },
    },
    required: ['pattern'],
  },
};

function state(doc: string) {
  const s = EditorState.create({ doc, extensions: [json()] });
  ensureSyntaxTree(s, doc.length);
  return s;
}

function complete(docWithCursor: string) {
  const pos = docWithCursor.indexOf('|');
  const s = state(docWithCursor.replace('|', ''));
  const r = jsonSchemaCompletion(SCHEMA)(new CompletionContext(s, pos, true));
  return r ? r.options.map(o => o.label) : null;
}

describe('nodeAtPath', () => {
  it('finds a property value inside an array item', () => {
    const s = state('[{"pattern": 1}, {"category": "c"}]');
    const node = nodeAtPath(s, [0, 'pattern'])!;
    expect(s.sliceDoc(node.from, node.to)).toBe('1');
  });

  it('stops at the object when the property is missing', () => {
    const s = state('[{"pattern": 1}, {"category": "c"}]');
    const node = nodeAtPath(s, [1, 'pattern'])!;
    expect(node.name).toBe('Object');
    expect(node.from).toBe(17);
  });
});

describe('jsonDiagnostics', () => {
  it('underlines each issue at its path; a container only at its bracket', () => {
    const s = state('[{"pattern": 1}, {"category": "c"}]');
    const d = jsonDiagnostics(s, () => [
      { path: [0, 'pattern'], message: 'expected string, got number' },
      {
        path: [1, 'pattern'],
        message: 'required property "pattern" is missing',
      },
    ]);
    expect(d.map(x => [x.from, x.to, x.message])).toEqual([
      [13, 14, 'expected string, got number'],
      [17, 18, 'required property "pattern" is missing'],
    ]);
  });

  it('reports a parse error once and never calls the checker', () => {
    const check = vi.fn(() => []);
    const d = jsonDiagnostics(state('[{'), check);
    expect(d).toHaveLength(1);
    expect(d[0]!.severity).toBe('error');
    expect(check).not.toHaveBeenCalled();
  });

  it('an empty document has no diagnostics', () => {
    expect(
      jsonDiagnostics(state('  '), () => [{ path: [], message: 'x' }])
    ).toEqual([]);
  });
});

describe('jsonSchemaCompletion', () => {
  it('offers the property names the object does not set yet', () => {
    expect(complete('[{"pattern": "x", |}]')).toEqual([
      '"category"',
      '"owner"',
      '"provider"',
    ]);
    expect(complete('[{|}]')).toEqual([
      '"pattern"',
      '"category"',
      '"owner"',
      '"provider"',
    ]);
  });

  it('inside a half-typed name, offers every name but that property itself', () => {
    expect(complete('[{"pattern": "x", "ca|"}]')).toEqual([
      '"category"',
      '"owner"',
      '"provider"',
    ]);
  });

  it('offers enum and const values at a property value', () => {
    expect(complete('[{"provider": |}]')).toEqual(['"gitlab"', '"github"']);
    expect(complete('[{"owner": "|"}]')).toEqual(['"human"']);
  });

  it('replaces the whole quoted token, closing quote included', () => {
    const doc = '[{"provider": "|"}]';
    const pos = doc.indexOf('|');
    const s = state(doc.replace('|', ''));
    const r = jsonSchemaCompletion(SCHEMA)(
      new CompletionContext(s, pos, true)
    )!;
    expect([r.from, r.to]).toEqual([14, 16]);
  });

  it('has nothing to offer where the schema says nothing', () => {
    expect(complete('[{"pattern": |}]')).toBeNull();
  });
});
