# Console JSON editors and fix flow (spec 2 of 3)

**Status:** approved in brainstorming, 2026-09-25
**Repo:** apps (`apps/console`, `apps/board`, `packages/ui`)
**Depends on:** spec 1, settings schemas and validation (rt), shipped as the
rt-client and settings-kit releases it names
**Sibling:** spec 3, settings migrations (rt), independent of this one

## Why

Console's settings page can edit the 27 JSON keys that settings-kit shaped
(string lists, string maps, flat leaves); the other 28 are read-only. Spec 1 gives
every JSON key a registry schema, delivered on the def as JSON Schema, plus a
`nonconforming` label on stored values that fail it. This spec uses both: forms for
the common shapes, a JSON editor for everything, and a way to fix broken values.

## Goals

1. Every writable JSON key is editable in console, inline on its row and in the
   explain modal.
2. Common shapes get a form; every JSON key also gets an Edit-as-JSON editor.
3. An edit is checked against the key's schema as you type; an invalid value can
   never be saved.
4. Stored values that fail their schema are easy to find and fix.
5. Board's settings modal moves to the same schema-based widgets.

## Non-goals

- Schemas themselves, server validation, `rt settings check` (spec 1).
- Migrations (spec 3).
- Editing `external` keys (board edits those in its own UI) or secrets.

## Design

### Picking the editor

settings-kit's `recognize(schema)` (spec 1) picks the editor. Every JSON row keeps
its collapsed summary ("3 items", "2 fields", the first entries) and expands in place.

| Recognized as | Editor |
|---|---|
| `stringList` | tag pills (today's widget, unchanged) |
| `stringMap` | key/value rows (today's widget, unchanged) |
| `leaves` | labeled fields (today's widget, unchanged) |
| `objectList` (array of objects with scalar properties) | item cards |
| `objectMap` (map of string to object with scalar properties) | named sections |
| `json` (anything else) | JSON editor only |

### Item cards (`objectList`)

- One card per item, in order, with Add item, Remove, and Move up / Move down.
- Each card shows a field for every required property plus every optional property
  the item already sets. An "Add property" menu lists the optional properties the
  schema allows and the item does not set yet; a set optional property has a remove
  control, a required one does not.
- Field controls follow today's scalar rules: enum → Select, boolean → Switch,
  number → NumberInput, string → TextInput (Autocomplete where suggestions exist).
- Unknown extra properties (allowed by spec 1's lenient schemas) are shown read-only
  at the bottom of the card with a note to use Edit as JSON, never dropped on save.
- New items start from the schema's defaults for required properties, else empty,
  and show their errors until filled.

### Named sections (`objectMap`)

- One section per entry, titled by its name, with Remove; "Add entry" asks for a
  name (rejecting duplicates and empty names), then shows that entry's fields.
- Inside a section: the same field grid and "Add property" as an item card.

### JSON editor

- Every JSON row and the explain modal have an "Edit as JSON" toggle; for `json`
  keys it is the only editor.
- Built on the kit's lazy `CodeMirror` (`@mattstack/app-kit/lazy`) in `json` mode.
  The kit gains a `jsonSchema?: object` prop that lazily adds schema linting (errors
  underlined at their exact path) and completion of property names and enum values.
  CodeMirror packages stay inside the kit, per the import wall.
- The draft is pretty-printed with two-space indent. Save is disabled while the text
  does not parse or fails the schema; the first issue shows under the editor.
- Escape abandons the edit and does not close the explain modal (the same rule the
  modal already applies to fields).
- Switching between form and JSON keeps the draft; switching to the form is disabled
  while the JSON does not parse, with a note saying why.

### What an edit writes

- Every editor edits the target layer's own stored value, never the merged view,
  using `leafWrite`/`fieldSource`'s rule from view.ts: for a deep-merge key, the
  draft starts from that layer's authored value, so defaults and other layers'
  fields are never copied into the store being written.
- The draft is checked with settings-kit's `checkValue(schema, value)` as it changes;
  the server's `/set` check (spec 1) remains the final word, and a refusal shows on
  the row like any other refused save.

### Fixing broken values

- The toolbar gains a "Needs fixing N" chip next to Changed and Editable. N counts
  keys with any `nonconforming` or `invalid` layer; the chip filters to them.
- A flagged row shows a warning line listing each issue with its path and layer, for
  example `user · [2].url: expected string`.
- "Fix" on that line opens the key's explain modal with that layer's editor open
  (form when it can draw the value, else JSON), the issues highlighted, and Save
  disabled until the value passes. "Remove from <layer>" stays available.
- Values that fail the type check (skipped by rt today) take the same path; their
  editor opens in JSON.

### Board

- Board's settings modal moves off `SHAPES` to `recognize(schema)` with the same
  widgets, and gains item cards, named sections and the JSON editor for keys it
  shows. Its `external` keys keep their own UIs.

## Testing

- Tests first for each editor: add, remove, reorder and add-property on item cards;
  add and remove entry on named sections; JSON parse and schema errors blocking Save;
  switching between form and JSON keeping the draft; Escape abandoning without
  closing the modal; unknown extra properties preserved on save.
- A deep-merge key edited through each editor writes only the target layer's own
  fields.
- Needs-fixing chip counts and filters; Fix opens the right layer's editor.
- Previously shaped keys render exactly as before (existing console and board tests
  stay green).
- UI validation: Fast Browser against a branch build on live data, both schemes, for
  one key of each editor kind and the fix flow, compared with the current page.
  Never save through the test server; check `rt settings get
  rt.notify.eventBridges --json` afterwards.

## Acceptance

- `rt.notify.eventBridges` can be edited as item cards and as JSON; an item without
  `pattern` cannot be saved.
- `deck.apps` can be edited as named sections.
- A key the forms cannot draw is editable as JSON with inline schema errors.
- A nonconforming stored value appears under Needs fixing and can be fixed from the
  modal.
- Nothing about today's shaped keys changes visually.
