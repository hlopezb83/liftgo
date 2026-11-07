# Global quote search

Scope: quick navigation (`GlobalSearch`), not the paginated Quotes screen. No
schema, migrations, financial permissions, billing workflows or deployment are
changed.

## Behavior and boundaries

- Quote requests require an authenticated user, a verified organization and
  `useHasModuleAccess("Cotizaciones", "read")`. Cache identity includes the
  organization, user, financial permission, quote permission and search text.
- Every quote request selects only ID, folio and customer name, applies the
  organization and `(is_e2e IS NULL OR is_e2e = false)` filters, and orders by
  `created_at DESC, id DESC` with limit 5.
- A strict optional `COT-` prefix followed by digits is normalized without
  numeric conversion. `445`, `0445`, `COT-0445`, `cot-445` and `000445` all look up
  `COT-0445` in a separate exact request. That request cannot be displaced by
  five newer broad matches. Results merge exact-first, deduplicate IDs and
  remain capped at five total.
- The broad request searches folio and customer name. LIKE wildcards and the
  PostgREST logic grammar are escaped separately. Terms containing `*` use a
  fully escaped, case-insensitive literal regex (`imatch`), because PostgREST
  rewrites `*` to `%` in LIKE patterns even when escaped.
- Each effective request contributes to failure accounting. One successful
  request, including an empty result, prevents a total error. A failed exact or
  broad request preserves the other's results and shows a partial warning.
- The UI never renders raw backend errors. Total and partial errors offer retry,
  disabled during a request. Pending, debounce and fetching states do not show
  a false empty state. Current permission checks hide revoked quote results
  and errors and guard quote navigation.
- cmdk still filters module names and keywords. The normalized exact hit uses
  the current search term as its cmdk value, so it remains visible and ranks
  first even for `000445`. Existing dialog focus handling is unchanged.

## Offline verification

```sh
./node_modules/.bin/vitest run src/features/system src/test/mobileFocus/dialogFocus.test.tsx --maxWorkers=2
./node_modules/.bin/eslint src/features/system --max-warnings=0
bash scripts/arch-check.sh
NODE_OPTIONS=--max-old-space-size=1800 ./node_modules/.bin/tsc --noEmit
```

The HTTP contract test uses the real Supabase/PostgREST builder with mocked
fetch. It checks both repeated `or` parameters, tenant filters, exact lookup,
projection, sort and limit. Its response ordering is a deterministic simulated
server. The UI tests use real cmdk and Radix, including ranking, navigation,
permission revocation, errors, retry and focus regressions.

These offline tests do **not** execute SQL, validate live RLS policies or prove
that a particular record exists in the deployed database. Live acceptance
requires an authorized test tenant and an existing non-E2E folio. Publication
and that live acceptance check are separate from this code change.
