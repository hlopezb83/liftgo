# Authenticated REP claim baseline

Base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

This initial commit contains only the authenticated API regression, before the
0105 function correction. The existing A/B workflow creates an isolated,
ephemeral backend. The test uses ordinary SDK authentication and synthetic
invoices/payments; no PAC, browser, published backend, grants or remote migration
is involved.

Expected regression: a `stamping` row aged six minutes must remain unchanged
when the caller requests a one-minute stale threshold. Main currently reclaims
it. Later assertions also exercise identified rows, tenant/role denial and a
concurrent clean pending claim. These are only considered executed if the
workflow reaches the respective assertions.

The corrective commit and its offline before/after evidence will follow after
the baseline workflow result is recorded. This baseline alone is not ready to
merge. Raw workflow logs and environment identifiers are not deliverables.
