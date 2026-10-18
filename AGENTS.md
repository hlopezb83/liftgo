# Scoped UI architecture

- Keep supplier-bill header actions in their focused component; this isolates menu interaction tests from payment dialogs and data hooks.
- Supplier payment dialogs opt into close autofocus using the page-owned current actions ref; resolve it at teardown so responsive header remounts cannot leave a stale focus target.
- Use the opt-in `stackedControls` layout only for lists requiring separate search and facet rows; default list geometry remains unchanged.
- Bank reconciliation keeps a single mounted table and a viewport-independent Sheet inspector; at close resolve the current mounted row or the accessible current list region as fallback, so virtualized or removed rows never leave focus on BODY and selection/scroll remain intact.