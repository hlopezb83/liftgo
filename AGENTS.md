# Scoped UI architecture

- Keep supplier-bill header actions in their focused component; this isolates menu interaction tests from payment dialogs and data hooks.
- Supplier payment dialogs opt into close autofocus using the page-owned current actions ref; resolve it at teardown so responsive header remounts cannot leave a stale focus target.
- Use the opt-in `stackedControls` layout only for lists requiring separate search and facet rows; default list geometry remains unchanged.
- Bank reconciliation keeps a single mounted table and a viewport-independent Sheet inspector; resolve the current line's focus target at close to preserve selection and scroll.