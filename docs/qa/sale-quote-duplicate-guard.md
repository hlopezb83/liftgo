# Sale quote duplicate invoice guard (candidate 0130)

## Confirmed cause

The source transaction RPC (0127) deliberately does not update an already accepted/converted quote. Two prefilled forms therefore retain the same valid quote version. Equipment sale lines are exempt from charge quantity tracking, and sale invoices without bookings do not encounter the booking/period uniqueness index. The sale detail UI intends one invoice (continue draft / already invoiced), but stale forms bypass that UI decision.

## Proposed scope

A trigger reserves each linked sale quote for one active invoice. It uses the existing quote lock order, a separate volatile READ COMMITTED conflict read, explicit organization equality, and an existing RLS-bypassing owner. It creates no client RPC access and does not change roles. The migration refuses an unsuitable owner.

The guard covers insertion, quote reassignment, reactivation, new administrative issuance, and entering stamping. Existing duplicate rows remain unchanged. Ordinary edits and cancellation remain possible. Fiscal results already in flight must still be persisted, including the simultaneous draft-to-sent/UUID update after PAC and error/pending-to-stamping recovery carrying a remote PAC ID. Only a new stamping claim without remote identity is revalidated. No PAC operations are part of these tests.

A valid unfiscalized cancellation releases the reservation. Stamped/pending fiscal cancellation remains reserved until cancellation is accepted, following the existing quote-charge active-invoice predicate.

This is uniqueness per linked sale quote, not per physical equipment. Manual invoices without quote_id and changing a draft/sent quote from rental to sale are outside this change. A second invoice of partial/additional charges linked to the same sale quote is blocked too; this matches the existing sale UI's single-document contract and is stricter than rental charge allocation.

## Dependencies and verification

0130 follows PR410's 0129 quotes page migration (byte-for-byte copy in the integration candidate). Do not apply either merely by merging this candidate. The combined canonical migration tree needs review and pin update.

Local in-memory PostgreSQL model: 12 groups pass (baseline duplicate, creation/issuance rejection, in-flight fiscal completion, recovery with remote PAC identity, rental, cancellation/reactivation, stamped cancellation, multirow atomicity, reassignment, isolation guard, normal claim completion, hidden-conflict RLS model). It is not full schema or multi-session evidence.

The standalone PostgreSQL model runner is prepared but cannot start in this execution environment: Unix socket creation returns Operation not permitted, including after a permitted escalation. No production connection was attempted.

PR409 independently adds full-schema authenticated/service-role sequential and concurrent sale regression scenarios, without booking periods. Those tests must fail on the old implementation and pass against this migration before release. Full-schema tests, owner/ACL checks, and new migration deployment remain pending.
