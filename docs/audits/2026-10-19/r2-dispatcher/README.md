# R2: booking cancellation and hidden active invoices

Audited base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

## Baseline stage (tests only)

The initial baseline commits of `booking-invoice-cancellation-api.spec.ts` add 21 expectations against the existing ephemeral A/B backend. Four further fixture-state controls cover pending and accepted fiscal cancellation, plus two lock-order cases exercise the actual billing RPC (27 total). ASUS has no running local Supabase stack, so these tests are prepared for the existing A/B CI lane; no dynamic result is claimed until that run finishes.

The A/B seed adds disposable Auth dispatchers in both synthetic organizations and validates their roles. Every case logs in through `createLocalUserClient`, verifies Auth user, membership-derived organization and actual role, then uses ordinary PostgREST SDK requests for fixture rows, operations, reads and cleanup. Business rows use the default `is_e2e=false`. Dispatchers must still see no invoice rows. No role/credential/policy is changed in a published backend.

The matrix covers admin and dispatcher, RPC and direct UPDATE, direct and pivot invoice links, draft/cancelled controls, later draft emission, foreign organization denials, inverse links to cancelled bookings, and four overlapping issue/attach versus cancellation cases. Another two races start with a draft without pivots and a cancelled booking, then reverse the order of emission and new pivot attachment while both requests overlap. Whole invoice/booking/link snapshots verify rejected writes do not drift.

The lock coordinator uses the existing loopback `DB_URL` only for `SELECT ... FOR UPDATE` and lock observation. It performs no business mutation or JWT/GUC impersonation. Actual racing operations remain authenticated SDK requests. It forces both orderings without new RPCs, test triggers or timing sleeps: hold a booking to queue billing before cancellation, or hold an invoice to queue billing while cancellation commits. `pg_blocking_pids` confirms the request is waiting before the next step. Locks are released and started requests settled even on failed expectations.

### Baseline result

[A/B run 39210544534](https://github.com/hlopezb83/liftgo/actions/runs/39210544534) ran head `c154c81540fb2c237c6d5c6ed18f907aeae57274` without new migration SQL. The new file reached real Auth/SDK operations: 3 passing tests (owner RPC direct/pivot controls and foreign dispatcher denial), 18 failing tests. Six failures specifically show the absent `23514` cancellation rejection for dispatcher RPC/direct UPDATE and owner direct UPDATE with direct/pivot active invoices. `baseline-summary.json` preserves a safe structured summary, not raw job logs.

The run also exposed two test setup errors from inserting `status=cancelled` directly; those fixtures now start sent and use the ordinary SDK cancellation update. All case clients now sign out with `scope: local`; the original default global sign-out could invalidate other clients belonging to the same synthetic user and may explain seven legacy UI/seed failures in that run. Those unrelated failures are not counted as product findings. The corrected after run must verify them again.

## Proposed migration design (not yet implemented in this stage)

`cancel_booking(uuid,text)` remains SECURITY INVOKER, including its existing row lock and guards. A private SECURITY DEFINER trigger will inspect same-organization active invoices on cancellation, including direct and pivot links, so that a dispatcher cannot bypass the rule through invoice RLS. The active predicate matches the current RPC: status outside draft/cancelled and cancellation not accepted. Pending cancellation remains active.

A cancellation-only trigger cannot protect the opposite order. Two private reciprocal guards are needed: invoices on activation/link/cancellation changes, and invoice_bookings on INSERT/UPDATE. They lock the invoice before booking rows, lock bookings in deterministic order and reread after lock acquisition. The cancellation side holds its booking row but only reads invoices without locking them, avoiding the reverse invoice/booking lock order. Existing advisory billing locks remain untouched. Functions must be volatile, have a fixed search_path and no callable grants.

Drafts can remain linked after booking cancellation; later activation is blocked. Unrelated edits of legacy inconsistent invoices must remain possible when lifecycle/link/cancellation fields do not change. The migration must not update existing business rows or grant invoice visibility to dispatcher.

The inspected `save_invoice_with_bookings` takes advisory billing locks, then the invoice row before syncing pivots. `sync_invoice_bookings` takes advisory locks but does not lock a booking row before the invoice. The current `create_recurring_invoice` takes advisory locks, inserts its new draft/pivots, then updates `bookings.last_billed_date`; its existing-invoice branch updates that booking cursor and returns without a later invoice mutation. New guards must not acquire advisory locks after the invoice row. Two tests overlap the actual save RPC and direct emission in both invoice-lock orders, preserving normal success or the existing `55000` stale-version rejection and rejecting a new deadlock. This is a bounded claim about these billing RPCs, not every unrelated booking mutation.

Fiscal pending/accepted states cannot be fabricated by an ordinary authenticated SDK because the existing fiscal metadata guard forbids it. A separate fixture-only extension preseeds four synthetic invoice snapshots through the existing seed admin, explicitly separate from the authenticated operation under test. Cases then attach them, read them, attempt cancellation and clean them up through ordinary SDK login. A negative SDK fiscal-metadata write verifies that the existing guard still rejects assigning accepted. No CFDI UUID, Facturapi id, PAC call or fiscal bypass is used.

The dispatcher migration slot is reserved as **0106**, after the separately prepared REP claim migration 0105. SQL/journal/snapshot preparation waits for that base and the baseline CI evidence. Nothing in this document certifies a published ledger or authorizes migration application.
