import { useMemo } from 'react';
import { CodeMirror } from '@mattstack/app-kit/lazy';
import { checkValue, type JsonSchema } from '@mattstack/settings-kit/shapes';

/** The JSON text of a draft, completed and linted against the same schema
    the Save button checks, so an underline and the issue line agree. */
export function JsonDraft({
  text,
  onText,
  schema,
}: {
  text: string;
  onText: (t: string) => void;
  schema: JsonSchema | undefined;
}) {
  const check = useMemo(
    () => (schema ? (v: unknown) => checkValue(schema, v) : undefined),
    [schema]
  );
  return (
    <CodeMirror
      value={text}
      onChange={onText}
      language="json"
      height="260px"
      jsonSchema={schema}
      jsonCheck={check}
    />
  );
}
