# MEJ-005: monetary equivalence evidence

Base: main `24082043f` (8.44.17). Status: **local gates green, independent review
and integration pending**. The test-only commit `d5a604f62` exposed MEJ005-D1
with a normal failing acceptance test. A separate corrective commit changes
only UI percentage arithmetic and reuses existing decimal rounding; no fiscal
catalog, Edge calculation, SQL migration or provider behavior changes.

## Shared matrix

`tests/fixtures/monetaryEquivalence.ts` contains data and independently reviewed
expected decimal values, not another calculator. It feeds:

- UI: actual `computeTotals`, currency conversion, and rendered NC dialog with
  quantity editing and captured draft payload. All remote mutations are mocked.
- Edge: actual recurring-charge calculator, source-bound NC validator, FX gate
  and REP exchange decisions, also executed in native Deno without network.
- PostgreSQL: actual checked-in invoice/NC invariant triggers, FX conversion and
  missing-rate functions, and the cross-currency write guard. Separate explicit
  SQL numeric expressions provide the decimal arithmetic reference for lines and
  proration; those expressions are **not a product line-item calculator**.

Cases cover positive half-cent prices; fractional percentage discount (0.5%);
fixed discount; one-half/one-third fixed-discount allocation; partial percentage
NC; per-line rather than aggregate IVA; 0%, 8%, 16% and non-taxable lines;
MXN/USD/EUR, signed half-cent FX, a quotient just below half-cent, mixed payments
rounded before summation; and absent/null/zero/default-one/negative FX rates.

The synthetic COT0020 control is 90 + 14.40 = 104.40; its half NC is
45 + 7.20 = 52.20. This reconstructs the supplied **GUI control**, not XML
verification, provider acceptance, or a new observation of the published app.

FX failure is asserted explicitly: UI `missing_exchange_rate` and an
unconvertible count, Edge Spanish validation error, SQL `fx_is_missing=true`
and null conversion, plus rejected local write with SQLSTATE 23514. No missing
rate is converted at 1:1. MXN's rate-one exception remains intact.

Two different foreign currencies may be converted for accounting in UI/SQL;
the Edge REP decision deliberately refuses that cross-pair. The fixture asserts
the refusal instead of inventing provider capability or issuing a REP.

## Reproduced and locally corrected discrepancy MEJ005-D1

Input: one line, quantity 1, unit price/base 0.03, tax rate 16.5%.

- UI `computeTotals`: subtotal 0.03, IVA 0.01, total 0.04.
- Actual Edge charge calculator/source validator and PostgreSQL numeric:
  subtotal 0.03, IVA 0.00, total 0.03.
- Decimal contract: 0.03 × 16.5 / 100 = 0.00495, rounded once per line = 0.00.
- Current UI uses `money(base).multiply(rate).divide(100)`: the multiplication
  rounds 0.495 to 0.50, then division rounds 0.005 to 0.01.
- The UI-generated NC header is rejected by the source-bound Edge validator
  with `CREDIT_NOTE_TOTALS_MISMATCH`. No provider/network action is needed.

Before the correction, the acceptance test compared UI to the decimal contract
and **failed normally**: 24 other matrix tests passed, and the wider focused run
had 89 pass / 1 fail. It was not skipped, marked expected-failure, widened to a
tolerance, or rewritten to accept the divergent result. After correction that
same expectation is green, and UI-derived NC totals pass actual Edge source
validation. All three layers retain the shared input.

This is internal consistency evidence, **not a claim that 16.5% is a valid SAT
IVA rate**. The current application accepts it: customer `FiscalSection.tsx`
uses a free text tax-rate field; `customerFormSchema.ts` permits any finite
0..100; `customerPayload.ts` preserves the number. The database's customer
numeric tax-rate check is a range, not an integer/enum restriction (migration
`20260810192859_87236f77-6250-431d-8de6-a399f11a399f.sql`). Invoice schemas also
accept fractional numeric rates. Quote/invoice selectors are narrower but do
not invalidate a stored rate inherited from the customer/document.

A diagnostic sweep of 300,003 inputs (0%, 8%, 16%, cent bases 0.00–1000.00)
found no UI/Edge differences. The retained compact controls use 0/8/16 and
half-cent/cent boundaries; this is not a proof for all magnitudes or all inputs.

### Applied local correction, separate commit

`computeTotals` normalizes the base as before and rounds the percentage product
only once at the monetary boundary. The existing BigInt decimal-rational code
from `paymentCurrencyRounding.ts` moved to `src/lib/money/decimalRounding.ts`;
the original feature path re-exports its unchanged FX API. An explicit internal
rounding mode preserves the UI's negative-half-toward-positive contract while
FX keeps half-away-from-zero. No tax-rate eligibility policy is added.

A simple `money(base * rate / 100)` was deliberately not used: binary products
can lose a cent at large magnitudes, and currency.js itself pre-rounds internally
to four fractional cent digits. For example, 0.01 × 49.9999% must remain 0.00,
not be promoted to 0.01. The exact decimal helper covers that near-half case,
1,000,000,000,000.03 × 16.5%, signed half cases and exponent notation.

The maximum-magnitude helper case isolates tax calculation; no promise is made
for invoice grand totals beyond currency.js's safe integer-cent range. The
large complete-invoice case stays within that range. Independent PostgreSQL
numeric expressions verify all twelve additional precision/sign expectations.
SQL's signed FX rounding differs intentionally from UI's legacy sign contract.

Controls retain 0/8/16, per-line sums, fixed/fractional discounts, partial NC,
negative NC rejection and existing signed FX behavior. Generic `roundMoney`,
`sumMoney`, SQL tolerances and provider payloads were not rewritten.

## Deliberate boundaries

- SQL runs only in the launcher-owned fresh loopback PostgreSQL cluster; it
  verifies `data_directory`, creates its own empty database and stops with the
  existing launcher. No `.env`, custom database URL, remote DB or HTTP is used.
- This is focused integration, not full schema replay, RLS or permission tests.
  Product function bodies are extracted from their checked-in migrations; a
  new overriding definition causes the fixture to fail pending source review;
  permissions and unrelated triggers are not copied or bypassed on a live DB.
- Header triggers validate stored sums, not recompute lines. SQL arithmetic
  reference expressions are explicitly separated from actual product functions.
- SQL NC totals currently allow a 0.01 header tolerance; Edge source validation
  requires exact cents. Tests retain both contracts and reject 0.02 in SQL.
- Generic UI `sumMoney` rounds after accumulation, Edge `sumMoney` rounds each
  operand. Generic UI negative half rounding also differs from Edge. Those are
  existing documented helper contracts, not interchangeable fiscal boundaries;
  the tests use the actual document and FX paths instead of changing helpers.
- No Sandbox edits, payments, timbrados, XML downloads, migrations, deployments,
  workflow/secret changes or dependency changes were performed.

## Reproduction and evidence

```sh
node node_modules/vitest/vitest.mjs run src/test/monetaryEquivalence.test.tsx --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit -p scripts/tests/fiscal/tsconfig.json
RUN_LOCAL_FISCAL_TESTS=1 PG_BIN=/trusted/postgresql/bin node scripts/tests/fiscal/run-rep-postgres.mjs
cd supabase/functions
deno test --no-config --cached-only --no-lock _shared/monetaryEquivalence_test.ts
```

The explicit Deno command uses previously cached official standard assertions
and imports only pure local dependencies. No-config avoids resolving unrelated
project-wide npm imports; no network permission or lockfile mutation is granted.
The regular offline Deno selector discovers the new `_test.ts` automatically.

Results on 2026-10-20/21 UTC:

- UI shared matrix: 25 pass after correction, including the originally red D1;
  additional exact-decimal controls: 15 pass. No skipped or expected-failure cases.
- Deno shared matrix: 19 pass. With existing money/discount/FX/REP-decision tests:
  69 pass.
- PostgreSQL monetary suite: 32 pass. Existing REP suite: 11 pass, 43 combined.
- Focused UI/domain/NC/FX regression run: 105 pass across nine files.
- Fiscal integration and isolated arithmetic TypeScript: pass. Touched UI/domain
  files lint: pass. The repository's
  ESLint configuration ignores fixture/integration directories, so no lint
  coverage is claimed there.
- Whole-project TypeScript was terminated by the execution environment (`Killed`),
  not accepted as a pass; the integrator owns the global validation gate.
