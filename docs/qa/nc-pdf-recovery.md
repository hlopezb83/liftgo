# File-only recovery of credit-note PDFs

This change is rebuilt on main `8f8071ff5c2bfb6d76c30dc81d9062ee7c66bf3b`. An earlier local patch was not recoverable; its tests are not evidence for this implementation.

## Scope

The existing NC reconciler can finish stamping after obtaining XML even when PDF download fails. The fiscal document is already issued, but the old cron selects only `stamping` NCs. Manual `download-cfdi` already supports downloading the existing provider PDF. This adds an independent file-recovery processor and a visible missing-PDF notice. Successful manual download refreshes the NC query; failure leaves the notice intact.

Eligible records must have both statuses `stamped`, cancellation status `none`, a stored XML reference, `cfdi_xml_pending=false`, no PDF reference, known provider ID and UUID, and an update older than ten minutes. Each selection is limited to ten, oldest first. Manual invocation remains scoped to the caller's organization; configuration remains scoped to each document's organization. Failure of this optional selection is reported without stopping existing fiscal work.

The processor claims using the exact organization, state, identifiers, XML reference and database timestamp. It retrieves the known provider ID, requires matching ID/UUID, type E, status valid, optional external ID and the configured live/test mode, and downloads only its PDF. It never searches by external ID, creates, reissues, refreshes SAT status, cancels, or changes amounts, balances, XML, fiscal status, lookup/stamping counters or fiscal error messages.

NCs currently have no reliable emission-environment field. A 404, missing or contradictory provider identity/mode remains pending. No other key is tried and no environment is inferred from the parent invoice.

## Persistence and limits

Both claim and final update use the complete compare-and-swap predicate and require a confirmed returned row. The timestamp returned by the database is reused exactly, including microseconds. Provider calls have eight-second timeouts; the real SDK GET wrapper receives the abort signal. Binary streams are bounded to 10 MiB and must start with `%PDF-`. This is a file-format sanity check, not independent fiscal validation of a PDF.

Each upload uses a tenant-scoped, attempt-owned object and `upsert=false`, so it cannot overwrite a concurrent manual recovery's object. A failed or uncertain final write is never reported as recovered and does not delete the upload, since the write may have succeeded. This can leave an unreferenced object; no automated deletion is introduced.

There is no new migration, permission, counter or automatic fiscal action. Claims delay another attempt by ten minutes, with no lifetime retry limit. The existing cron budget is checked between calls; calls already in progress may finish after the loop budget. Storage uploads and database writes do not have an additional local deadline. Permanently invalid or unconfigured oldest records can occupy the bounded selection and need operator attention. XML-pending, cancelled, cancellation-pending and already linked PDF records are outside this lane; this does not repair broken non-null PDF links.

## Validation

Tests execute the actual handler with an independently evaluated in-memory query/CAS fixture and offline provider/Storage/auth dependencies. Negative cases cover auth/tenant isolation, full eligibility and ordering, provider mismatches, unavailable configuration, claim/final write errors and zero rows, file limits, storage failures, concurrent cancellation/claims/manual recovery, cooldown and idempotence. Existing NC/REP transition tests must continue to pass. UI tests preserve stamped presentation/read access, avoid a re-stamp action, and refresh only after successful download.

No real provider request, fiscal operation, database migration or production deployment is a validation step. CI and review results must refer to the new commit, not the unavailable prior patch.
