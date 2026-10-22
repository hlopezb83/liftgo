# Preserve completed recurring modality (0122)

## Root cause and minimal change

A real return calls `complete_return_inspection` (0081), which transitions the booking to completed. The installed `trg_bookings_clear_recurring_on_cancel` then erased `recurring_billing`, even though manual recovery needs the original billing modality. `reconcile_expired_bookings` independently erased it with an explicit assignment.

0122 changes only those two function definitions. Completing preserves the existing true/false value; cancellation still clears it, including a defensive completed-to-cancelled transition. The cancellation RPC's existing transition restrictions are unchanged. No historical booking is automatically changed and no monthly-rate heuristic is used.

The reconciliation test also exposed an existing integration failure: its completion UPDATE did not set `app.booking_rpc`, which the installed completion guard requires. The fix sets that transaction-local context only around the existing closable UPDATE and restores the previous value immediately afterward and on exceptions. It also restores the previous forklift context instead of forcing it off. Previously unset custom settings restore to the inactive empty string. The completion guard, real-inspection requirement, admin check, tenant/RLS behavior, equipment release logic, function grants and invoker security remain intact.

The automatic billing worker and RPC remain confirmed-only. Preserving a historical mode does not re-enable automatic billing on completed bookings. No Edge source is modified.

## Historical recovery policy

Do not backfill completed bookings based on rate, duration or inferred recurrence. An individual repair requires exact audit evidence that the booking was recurring immediately before the completion transition, matching current state, no subsequent changes, and review of existing claims.

The synthetic QA reservation RSV-0030 has exact evidence: audit INSERT a80af0ad-66ed-4690-861b-5d372368dce0 at 2026-10-22 04:58:12.233666 UTC recorded confirmed/true. Audit UPDATE 7bb86c1c-e7e1-45ed-a2f7-02a5450b0b8b at 05:04:58.771337 UTC recorded confirmed/true to completed/false with return_status changed. Read-only inspection found version 3, no later audit updates, zero invoice claims, and one matching return inspection.

A separate, specifically approved repair may set only this booking's recurring_billing=true with strict baseline fingerprints and audit-event checks. Ordinary triggers increment version/update timestamp and write audit/activity entries; they must not be disabled. This repair is not part of migration0122 and has not been executed. Other historical reservations remain unchanged until individually evidenced and authorized.

## Validation

The local regression executes the actual return RPC and installed lifecycle functions/triggers against a focused PostgreSQL fixture, not a helper-only replacement. Baseline reproduced lost recurrence and the reconciliation completion-guard error. A separate full-schema SQL regression is supplied for the existing CI database gate. Final results are recorded when the suite completes; local focused execution is not represented as full-schema replay.

Local execution completed: two independent baseline RED reproductions followed by 18 PASS, exit 0. Includes preservation after actual return and reconciliation, non-recurring false, no date/cursor change, return idempotency, real cancellation, defensive completed-to-cancelled trigger behavior on a temporary table (the real cancellation RPC still rejects that transition), caller context restoration after success/failure, missing inspection rejection, unauthorized callers, unchanged function ACL/ownership/security and trigger identities, no historical backfill and no automatic invoice creation. The Edge selection contract remains recurring=true AND status=confirmed. Full-schema CI must pass before deployment.
