# Explicit SAT codes for sale invoices

This is a new local reconstruction on main `841e31484a50e196c14e85dbe7ad5e93119db734`, not a recovered copy or byte-identity claim for the unavailable earlier artifact. It contains no migration, remote change, deployment or live fiscal operation.

## Scope

New sale prefills and manually added sale rows must not receive rental product/unit defaults automatically. Supplied values and existing invoice rows remain unchanged. The form remembers the sale context before removing a row, including the last row, so adding another cannot restore rental defaults. An unresolved source is handled conservatively rather than treated as rental. Dedicated logistics-charge construction retains its existing contract.

New manual rows requiring explicit selection carry `sat_selection_required: true`. The form schema, invoice serializer and reopened form preserve this restriction independently of `line_kind` or quote references. This closes the source-only historical case when all traced rows are deleted before a new row is added, without claiming that an unknown source is a sale. The marker remains after codes are filled or edited and after the last marked row is removed/replaced. Existing rows without it are not backfilled.

The stamping handler derives the tenant from the authenticated invoice organization. It resolves persisted `quote_id` and line `source_quote_id` references using an organization-scoped query. Invalid references, missing or malformed responses, unknown quote types and query errors block stamping instead of downgrading a sale to rental. A sale quote covers the invoice; a sale source quote covers its traced lines; `line_kind: sale` is also sufficient to require explicit codes.

Sale lines require nonblank string `clave_prod_serv` and `clave_unidad` before the claim, configuration lookup, test stub or PAC gateway. The pure payload builder repeats this check and never applies `78101803`/`E48` fallbacks to identified sale lines. Existing auth, tenant, test-data and issued-document guards run first. A rejected sale does not mutate the invoice, create retry jobs, load fiscal secrets or contact the PAC.

The persisted selection marker can only add a requirement. A false or absent marker cannot override a sale classification obtained from a stored line or verified source. A present nonboolean marker is rejected rather than silently relaxed. The same pre-claim gate and pure payload check apply to marked manual lines with no remaining quote reference.

## Limits

- Presence does not certify SAT catalog membership or suitability for the goods sold. The operator remains responsible for classification.
- Nonempty historical codes may have been manually selected or inserted by an older default. They are preserved, not blacklisted, replaced or retroactively certified.
- Existing issued-document idempotency handling is preserved. There is no bulk change to saved drafts or issued invoices.
- Invoice read, source read and the later atomic status claim remain separate operations. This is not a transactionally consistent snapshot and does not close the pre-existing concurrent-edit window.
- A manual line with neither sale metadata, a source reference nor the selection marker cannot be reliably inferred as a sale from its description or SAT code. This change does not invent that classification.

## Local validation

Tests use the real dependency-injected handler, authentication and tenant checks with synthetic Supabase fixtures and a fake PAC gateway. New handler tests forbid network fetches and assert zero side effects on rejection. Coverage includes blank/partial/nonstring codes, missing and malformed sources, tenant isolation, issued-document idempotency, the no-key stub path, configuration failures, payload preservation and rental behavior. Existing payload characterization tests remain in the suite.

Frontend tests exercise quote prefills, explicit and historical values, source loading and changes, and stateful row removal/addition. Local tests do not certify a deployed frontend, Edge function, real database or PAC integration.
