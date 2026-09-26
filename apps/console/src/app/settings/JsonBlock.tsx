import { Code, ScrollArea } from '@mattstack/app-kit/core';

/** Shared with FieldGrid's extra-property display, the same raw-JSON look
    at any size. */
export const BLOCK_STYLE = {
  background: 'var(--tk-inset)',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
} as const;

/** A stored JSON value in full: two-space indent, wrapping, scrolling
    inside a capped block so one long value never pushes the page. */
export function JsonBlock({
  value,
  maxHeight = 320,
}: {
  value: unknown;
  maxHeight?: number;
}) {
  return (
    <ScrollArea.Autosize mah={maxHeight} type="auto" data-testid="json-block">
      <Code block style={BLOCK_STYLE}>
        {JSON.stringify(value, null, 2)}
      </Code>
    </ScrollArea.Autosize>
  );
}
