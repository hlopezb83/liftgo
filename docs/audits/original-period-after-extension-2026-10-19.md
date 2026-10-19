# Original billing period after an extension

## Defect and correction

An extension draft or issued invoice previously excluded the whole booking from the invoice selector. Simply reopening it would have billed its expanded operational range, overlapping the extension.

For new non-recurring original invoices, the form now reconstructs the original end from a complete, continuous extension chain. Operational booking dates are never changed. The same original-term view feeds the selector, canonical period, rental quantities, quoted discounts and save validation. Extension invoice cancellation does not undo extension history.

Occupancy uses actual invoice periods through either the direct booking link or invoice-booking pivot. Draft, issued and paid claims reserve their period; cancelled claims do not. An original term disjoint from an extension remains available. Missing or invalid active invoice periods fail closed. Self-edit excludes the current invoice and uses its saved term to retain its booking alongside disjoint extensions. Existing recurring selection and billing policy are unchanged.

The form reads paginated, narrow billing evidence instead of the capped invoice display list. Query failures and page-limit exhaustion cannot silently reopen bookings. Invalid or discontinuous extension histories exclude only affected original bookings and show a review message. Evidence loading/errors block linked saves, not unrelated manual invoices. Cache keys follow invoice list and booking invalidations.

Quote-charge availability remains authoritative for logistics. Reopening the original does not repeat consumed delivery or collection lines, and does not reset user-entered tax policy or currency.

## Backend contract and compatibility limit

The accompanying migration replaces the exact-date duplicate test in `sync_invoice_bookings` with inclusive overlap checks for non-recurring bookings, retaining existing advisory locks, current-invoice exclusion, direct/pivot lookup, cancellation semantics and recurring exact-period behavior. Unknown or invalid historical periods also block new non-recurring claims.

This is a forward-only function change, not a data cleanup. Existing overlapping historical non-recurring drafts can be blocked even for a notes-only save because every transactional save revalidates links. Such records require deliberate reconciliation; this change does not silently grandfather duplicate billing, cancel invoices, or rewrite historical amounts. Other legacy write paths are not newly secured by this narrowly scoped migration.

## Verification

- Original 2026-10-23–24 remains selectable after extension 25–26 in draft, sent, paid or cancelled state.
- Original prefill produces USD 2 × 100 = 200 and FX 17.5, not four days; consumed logistics are not repeated on selection or reselection.
- Saving the original reserves its range; cancellation reopens it; editing itself excludes its own claim while still rejecting another active overlap.
- Direct-only, pivot-only and duplicate evidence, inclusive shared-day boundaries, adjacent ranges, missing/invalid periods and complete multi-extension chains covered.
- Discontinuous, duplicate and mismatched extension chains fail closed.
- Discounted original quote lines retain their accepted amounts after normalization.
- Actual form-hook integration covers availability, handler input, loading/error, forged/missing selected IDs and overlapping submitted periods.
- Existing quote-charge, extension FX, period compatibility, invoice handler and builder suites remain part of the focused regression run.

No remote migration, deployment, live business-data mutation or production-browser confirmation was performed by this change. Local regression results do not imply the fix is active on the deployed application.
