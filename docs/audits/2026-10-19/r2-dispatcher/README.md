# R2: booking cancellation and hidden active invoices

Audited base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

## Baseline stage (tests only)

`booking-invoice-cancellation-api.spec.ts` adds 19 expectations against the existing ephemeral A/B backend. ASUS has no running local Supabase stack, so these tests are prepared for the existing A/B CI lane; no dynamic result is claimed until that run finishes.

The A/B seed adds disposable Auth dispatchers in both synthetic organizations and validates their roles. Every case logs in through `createLocalUserClient`, verifies Auth user, membership-derived organization and actual role, then uses ordinary PostgREST SDK requests for fixture rows, operations, reads and cleanup. Business rows use the default `is_e2e=false`. Dispatchers must still see no invoice rows. No role/credential/policy is changed in a published backend.

The matrix covers admin and dispatcher, RPC and direct UPDATE, direct and pivot invoice links, draft/cancelled controls, later draft emission, foreign organization denials, inverse links to cancelled bookings, and four overlapping issue/attach versus cancellation cases. Whole invoice/booking/link snapshots verify rejected writes do not drift.

The lock coordinator uses the existing loopback `DB_URL` only for `SELECT ... FOR UPDATE` and lock observation. It performs no business mutation or JWT/GUC impersonation. Actual racing operations remain authenticated SDK requests. It forces both orderings without new RPCs, test triggers or timing sleeps: hold a booking to queue billing before cancellation, or hold an invoice to queue billing while cancellation commits. `pg_blocking_pids` confirms the request is waiting before the next step. Locks are released and started requests settled even on failed expectations.

## Proposed migration design (not yet implemented in this stage)

`cancel_booking(uuid,text)` remains SECURITY INVOKER, including its existing row lock and guards. A private SECURITY DEFINER trigger will inspect same-organization active invoices on cancellation, including direct and pivot links, so that a dispatcher cannot bypass the rule through invoice RLS. The active predicate matches the current RPC: status outside draft/cancelled and cancellation not accepted. Pending cancellation remains active.

A cancellation-only trigger cannot protect the opposite order. Two private reciprocal guards are needed: invoices on activation/link/cancellation changes, and invoice_bookings on INSERT/UPDATE. They lock the invoice before booking rows, lock bookings in deterministic order and reread after lock acquisition. The cancellation side holds its booking row but only reads invoices without locking them, avoiding the reverse invoice/booking lock order. Existing advisory billing locks remain untouched. Functions must be volatile, have a fixed search_path and no callable grants.

Drafts can remain linked after booking cancellation; later activation is blocked. Unrelated edits of legacy inconsistent invoices must remain possible when lifecycle/link/cancellation fields do not change. The migration must not update existing business rows or grant invoice visibility to dispatcher.

Fiscal pending/accepted states cannot be fabricated by an ordinary authenticated SDK because the existing fiscal metadata guard forbids it. A later fixture-only extension may preseed those synthetic snapshots through the existing seed admin, explicitly separate from the authenticated operation under test. No CFDI UUID, PAC call or fiscal bypass is needed.

The dispatcher migration slot is reserved as **0106**, after the separately prepared REP claim migration 0105. SQL/journal/snapshot preparation waits for that base and the baseline CI evidence. Nothing in this document certifies a published ledger or authorizes migration application.
