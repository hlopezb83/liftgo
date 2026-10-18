# Bank virtual-row timeout follow-up

Read-only diagnosis of [CI run 39174304148, shard 5/6](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117813688771). The original decoded job log is preserved in `job-117813688771.txt`; no job rerun was initiated by this agent.

## Observed

- The job checked out merge `07366befa0d5b0a7420a025cc078057c87036ea6` (head `a7704ca0aa35a55243f3fa6469a91809364e14d5` into main `89967ae5768cf23d18d65c975d2cc0ac13031cb4`). Ubuntu 24.04, Node 24.21.0, Bun 1.4.2, Vitest 4.1.11.
- Command: `bunx vitest run --shard=5/6 --coverage`; V8 coverage enabled. There is no per-test timeout override in this test/config.
- Only `BankReconciliationWorkspace.test.tsx:142` failed: the virtual-row J-navigation case took **5364 ms** and exceeded the global **5000 ms** test budget. The log points to the `it` declaration, not an individual assertion or wait. Other ten tests in that file passed. Shard result: **100 files / 587 tests passed; one file / one test failed**.
- Test, Workspace, BankStatementLinesTable, VirtualBody, vitest config, package.json and bun.lock all have identical blob IDs in audited base `ec177edf865671a9e9952f5cccd56a9db687f0bd` and head `a7704ca0aa35a55243f3fa6469a91809364e14d5`.
- Earlier directed comparisons are preserved in `../bank-baseline/`: the same case passed in **3697 ms** on the audited base and **3490 ms** on integration. Those were Windows Node 24.19.0 runs without CI coverage, so they are supporting evidence of a narrow time margin, not an equivalent CI reproduction.

## Read-only code findings and hypothesis

The test creates 120 rows to exceed the table's virtualization threshold (100). It opens/closes once, reopens, then performs **40 separate** `screen.getByRole('dialog')` calls and `fireEvent.keyDown(..., j)` events before closing again. Every event changes Workspace `activeId`; each event is flushed by Testing Library, rendering the real table, active-row classes and full candidate panel again. With a 600px viewport, 44px row estimate and overscan 8, roughly 22 virtual rows remain mounted. The test uses real Radix focus lifecycle and its asynchronous close autofocus. Candidate/network mutations are mocked; no real backend request is expected.

This gives a strong **timing-budget/workload hypothesis under coverage and runner scheduling**. It does not identify the precise phase that crossed the budget, prove CPU contention, or exclude an intermittent focus/observer wait. The generic timeout and unchanged code do not demonstrate a new product regression. A single exact-head failed-job retry is reasonable while preserving the first failure, as the parent is coordinating. A retry pass would not erase the instability.

## Proposed separate test improvement

Prefer a focused follow-up PR for the test: preserve the selection on line 0, determine the last currently mounted virtual row, open that row, and press J once into the first nonmounted row. Assert the target description, absence of its DOM row, unchanged tbody/table/scroll/selection and region focus after Escape. Cache the persistent dialog element for repeated key events where needed. Existing small-list tests already cover J/K/arrow navigation across multiple steps. This directly tests the virtual-window boundary with substantially fewer full renders; it retains the behavioral contract rather than merely increasing the timeout. Add timing checkpoints/profile output only in an isolated diagnostic run if the exact-head retry also times out.

No source, tests, configuration, K1 files, browser, database or CI job state were modified. Only this evidence directory was written. No additional local test suite was run for this follow-up.
