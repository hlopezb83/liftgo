# Recurring preview performance diagnostics

## Contract and privacy

Only a validated, tenant-scoped manual preview emits diagnostics. Cron/service
previews can span tenants and do not emit them. Generation, denied requests,
invalid requests and CORS preflights retain their response contracts without
preview diagnostics. Preview JSON and all billing decisions are unchanged.

The response adds `Server-Timing` and a server-generated `X-Recurring-Trace` UUID.
These two headers are exposed to the permitted origin; the existing CORS origin
allowlist is unchanged. The matching structured log has a fixed event name,
outcome, elapsed milliseconds, fixed phase names and numeric row/page counts.
It never accepts customer, organization or booking identifiers, request bodies,
SQL, invoice lines, credentials or error messages as diagnostic fields.

Clock/logging failures do not replace a business result or swallowed exception.
Each collector is request-local and emits at most once. Failed planning emits an
error outcome, never a partial successful preview. Existing application error
handling remains unchanged and is separate from this diagnostic log.

## Meaning of the timings

- `auth_cron`: checking the existing cron/service authentication path.
- `auth_user`: validating a manual identity, profile and allowed role.
- `auth_org`: resolving the caller's organization and its active state.
- `bookings`, `fiscal`, `history_linked`, `history_direct`, `charges`: aggregated
  elapsed time at each read boundary, including transport and lock waits.
- `plan`: deterministic in-memory planning after reads finish.
- `serialize`: preparing the successful preview JSON response.
- `total`: handler elapsed time until response diagnostics are attached.

These are **not pure SQL execution times**. The total excludes preflight,
connection establishment, gateway queues, runtime startup before the handler and
response transit. Concurrent phases may overlap, so their aggregated durations
can sum to more than total. An absent phase means it was not executed, not that
it took zero milliseconds. `*_rows` counters describe rows accepted after validation, not necessarily all
rows received before a failed validation, unique invoices or records scanned by
the query planner. `read_pages` and `charge_batches` count attempted calls,
including failures; `quote_ids` counts requested quote identities. No extra JSON
serialization is done to estimate read payload size.

## Comparing a candidate with a baseline

1. Verify the frontend release and the exact deployed function package through
   the supported deployment receipt. A source commit alone is not proof that a
   function is live.
2. Use the same authorized test tenant, scope, billing date and unchanged source
   records. Record cardinalities separately; an empty preview can still read
   active reservations and invoice history.
3. Capture first-observed opening, repeated calculation, reopening and explicit
   future scope separately. A first observation is not proof of a cold start.
4. Record browser preflight, POST-to-headers, total response duration and bytes.
   Match the response trace to the sanitized phase log when accessible.
5. Compare distributions only after collecting enough controlled samples. A few
   manual requests are observations, not reliable p95/p99 estimates. Do not run
   a load test against the operational database.
6. Re-run privacy, tenant isolation, failure and response-parity tests, plus the
   recurring planner's existing fiscal/coverage suite. Any change to emitted
   phases/counters must retain the fixed allowlists and safe failure behavior.

The instrumentation does not change SQL, migrations, authentication policy,
locking, preview freshness or production deployment. Deployment and subsequent
measurement must be coordinated separately with the release owner.
