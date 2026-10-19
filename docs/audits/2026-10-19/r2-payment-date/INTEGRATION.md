# R2 payment integration

The SAT and payment-date changes are combined from `5a06a9e025be96dada788e053713d247818d41b3`
and `a567eb28b129353e4723efb154be3e5ff11046b6`, both based on `7ac56b7`.
Their individual before/after evidence remains in the neighboring audit folders.

Independent review found an additional compatibility issue in the first date
candidate: immediate partial invalidation made the invoice issue-date adapter
replace a historical date with today. The unchanged real-consumer regression
and comparable results are in `compatibility/`.

The final change makes immediate partial invalidation opt-in through
`MaskedDateInput` and `DatePickerField`; only `RecordPaymentDialog` enables it.
Other date consumers retain their previous editing contract. The payment hook
still rejects missing/invalid dates before serialization and the dialog accepts
the invalidation instead of retaining a prior valid date.

Final combined validation after this refinement: **144/144 tests in 25 files**,
including SAT overrides, stamped REP fields, payment partial/invalid/empty dates,
the real invoice issue-date compatibility case, FX, permissions and existing
invoice regressions. Full TypeScript and ESLint of changed sources/tests pass
without diagnostics. The individual offline runs are not published-backend QA.
