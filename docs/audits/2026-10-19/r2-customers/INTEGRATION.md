# Integrated review checkpoint

Base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

Customer currency/origin changes and the depreciation presentation correction
were integrated in an isolated worktree. Independent review found no remaining
navigation blockers. A CSV half-cent mismatch found during review was corrected
and separately approved; its comparable five-case evidence is in
`../r2-depreciation/fix-review-csv/`.

Final combined verification after that correction:

- 103 tests passed in 16 files (customer navigation/list interactions, invoice
  navigation, statement row builders/presentation, report and PDF controls).
- Application TypeScript: exit 0.
- ESLint over every changed TypeScript source/test file: exit 0.
- `git diff --check`: exit 0.

The original six customer regressions and seven depreciation regressions failed
before their respective patches. Five additional half-cent CSV regressions
failed before the review correction. Original checkpoint evidence remains
unchanged, with its documented base and hashes.

All amounts and customer identities in the evidence are synthetic. No database
or permission change, migration, browser, published transaction, PAC request or
release/version edit was used. CI/build and the existing ephemeral A/B gate are
the remaining integration checks; their run links belong in the review PR.
