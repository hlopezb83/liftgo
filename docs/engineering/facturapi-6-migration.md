# Facturapi 6 migration

## Scope and transport contract

This candidate replaces the dependency-only update proposed in #429. The SDK is
pinned to `facturapi@6.0.0` in the functions import map and frozen Deno lock.

Facturapi 6 retains `invoices.client.request` and `post`, but removes the transport
`get`, `put` and `delete` helpers, including the PDF recovery lane. The old compatibility fallbacks consequently
lost `AbortSignal` for retrieve, cancel and SAT refresh. Calling `post` directly
also bypassed the resource method's response date-conversion plan.

The adapter now calls `invoices.create`, `cancel`, `retrieve` and `updateStatus` on
a per-call resource view whose `client.request` adds the requested signal. It
preserves the SDK's method, encoded path, query, error and date conversion logic.
It does not mutate the shared resource, transport, fetch or credentials. An
unsupported abortable transport fails before sending a fiscal write; an already
aborted signal also fails before sending. Creation and cancellation are not
retried. A SAT refresh is never substituted by a cached retrieve.

Credit-note PDF recovery uses the same scoped adapter for metadata retrieval and
PDF download. Its existing 8-second timeout, 10 MiB bound, header/body abort,
identity checks, attempt-owned upload path and compare-and-set rules are unchanged.

## Dates and binary downloads

The adapter returns the same values as the SDK: response timestamps are `Date`
objects, while SAT stamp timestamps and calendar dates remain strings. JSON
serialization at HTTP/database boundaries emits ISO timestamp strings. Existing
fiscal handlers use identifiers, statuses and amounts from SDK responses and
create their own persistence timestamps; they do not perform string operations
on SDK timestamps. No generated Supabase types or database migrations change.

The contract suite covers all four operations, actual abort rejection,
pre-aborted writes, concurrent signals, unchanged client references, encoded
identifiers, response and nested payment/cancellation timestamps, unchanged SAT
and calendar dates, error metadata, list queries, and real SDK PDF/XML binary
conversion with non-ASCII XML and non-text PDF bytes.

## Validation commands

- `deno test --frozen --allow-env --allow-read _shared/facturapi/sdk6_contract_test.ts`
  from `supabase/functions` after caching dependencies.
- `bash scripts/deno-tests-offline.sh` for the complete offline handler/unit suite.
- `deno fmt --check` and `deno lint` for changed TypeScript files.
- `node --test scripts/tests/deno-ci-import-map.test.mjs` to verify CI's temporary
  import map retains the pinned Facturapi alias.

Offline tests mock only Facturapi requests and do not call a real fiscal service.
Passing them alone is not authorization or evidence for a production rollout.

## Sandbox release gate

Before integrating this candidate, verify the exact candidate SHA in an isolated
executor. Confirm the intended demo tenant by organization ID and legal name,
explicit `facturapi_mode = test`, a test-prefixed credential, its exclusive owner,
and the provider's matching test organization. Keep credentials inside the
backend; never print or commit them.

Only synthetic documents for ELOGISTIX SHIPPING are in scope. Exercise CFDI-I,
payment and REP, credit-note issuance/cancellation, retrieval and status refresh,
PDF/XML download, and repeat requests to detect duplicate issuance. Record
provider test mode, synthetic document IDs, amounts, resulting states and the
candidate SHA without secrets or customer data. Reconcile any timed-out or
uncertain issuance before trying again. Do not modify other tenants, use live
credentials, deploy shared functions, or change the published application merely
to obtain a sandbox test. If no isolated candidate runtime is available, keep the
PR as a draft and report that gate as unrun, not passed.
