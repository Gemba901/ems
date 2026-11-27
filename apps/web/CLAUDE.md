@AGENTS.md

## Frontend kit

Follow [the frontend conventions](../../docs/frontend/conventions.md). Use the
controls in `components/ui`, shared compositions in `components/patterns`,
and page templates in `components/templates`. Use semantic colour tokens and
the shared Dialog or Sheet for overlays. Keep module components within their
own module. Request shared additions or exceptions from the frontend owner.

Run `pnpm --filter web ui:drift --check` after changing app or module UI.
When cleaning up existing violations, regenerate the reduced baseline with
`pnpm --filter web ui:drift --write` and include it in the change.
