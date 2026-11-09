# Document reconciliation boundaries

This directory separates the existing recovery paths by document type. It is a
structural refactor, not a change to fiscal policy, permissions or scheduling.
There is no new endpoint, database migration, issuance or cancellation
operation.

## Ownership

- `index.ts` owns CORS/authentication, trusted manual-caller organization
  resolution, the request-wide clock, ordered selection, grouping,
  per-organization credentials, diagnostics and the HTTP response.
- `invoiceProcessor.ts` selects and recovers invoices. IDs recovered from the
  PAC are persisted for the **next** cycle; only already-known IDs proceed to
  XML/PDF recovery and the existing `reconcile_stamping_invoice` RPC.
- `paymentProcessor.ts` selects and recovers REP payments, then processes
  already stamped payments missing their internal folio. Recovered PAC IDs
  continue to document recovery in the same cycle. `recoverRepFolio` stays
  private here.
- `creditNoteProcessor.ts` selects and recovers stamping NCs, then calls the
  independent PDF-only recovery helper for already stamped NCs.
- `recoverCreditNotePdf.ts` is unchanged. It owns its full identity/snapshot
  CAS, provider checks and file-only recovery; it does not issue or cancel a
  document.
- `processorTypes.ts` contains only shared types. It does not create clients,
  resolve credentials, authenticate callers or introduce runtime state.
- `decisions.ts` remains the unchanged source of lookup/XML retry decisions.

## Ordering is part of the contract

Selection remains sequential: invoices, stamping REP, REP folio-only, stamping
NC, NC PDF-only. A failed invoice selection returns 500 immediately. The other
selection errors retain their existing log/report behavior. Except for that
fatal invoice error, every selection happens before the no-work early return.
Each queue retains a limit of 10; stale queues use the same strict ten-minute
cutoff. Folio-only selection intentionally has no stale cutoff.

Organizations preserve their previous insertion order: invoice, REP, NC,
folio-only, PDF-only groups. For each organization, processing remains:

1. Invoice recovery.
2. REP recovery.
3. REP folio-only recovery.
4. NC recovery.
5. NC PDF-only recovery.

The 50-second budget starts before CORS/auth and is shared by every processor.
Checks remain at the same row/lane boundaries. The orchestrator must invoke each
processor unconditionally before combining its `truncated` result: boolean
short-circuiting must not skip a later processor. This is a cooperative budget,
not a new hard deadline for existing database, storage or provider calls.

## Fiscal and persistence contracts retained

- Credentials stay organization-specific; no cross-tenant fallback is added.
- Rows without an organization are reported, not processed.
- Invoice claims retain their existing optimistic timestamp behavior.
- REP subsequent state writes retain the fixed claimed `rep_stamping_started_at`
  token, organization and `stamping` predicate.
- NC subsequent writes use the exact `updated_at` returned by each successful
  write, preserving database timestamp precision.
- Failed/unconfirmed REP or NC persistence stops that row without announcing the
  requested transition or proceeding to folio recovery.
- A provider miss and a failed lookup retain different retry accounting.
- Existing XML exhaustion behavior remains `stamped` plus the appropriate XML
  pending flag; PDF failure remains optional for fiscal reconciliation.
- Existing result names, error messages, result order, catch boundaries and
  empty/full response shapes are unchanged.

The extraction does not harden unrelated legacy behavior or unify the three
state machines. Changes to claims, retry policy, persistence handling, provider
identity validation or scheduling require a separate reviewed change.

## Offline verification

The Vitest handler suites import the real orchestrator and processors with only
external I/O mocked:

```sh
bun run test -- src/test/edge-functions/reconcile*.test.ts
```

The orchestration characterization suite is also checked against the
pre-refactor handler. It is intended to catch changed selection/processing
order, tenant isolation, response shapes, shared budget and the invoice/REP/NC
asymmetry. Existing REP/NC persistence and NC PDF provider/concurrency suites
remain intact. Deno decision tests and type/lint checks complement those handler
tests; decision unit tests alone do not verify orchestration. No verification
here requires a real fiscal operation or a connection to an operational
database.
