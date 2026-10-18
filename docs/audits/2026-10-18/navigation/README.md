# Navigation audit corrections

Base: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.

| Scope | Before | After | Evidence |
| --- | --- | --- | --- |
| N1 invoice origin and N4 unavailable booking status changes | 10 fail / 22 pass | 32 pass | [N1/N4](n1-n4/README.md) |
| N5 calendar origin/state and N6 range-loading focus | 6 fail / 5 pass | 11 pass | [N5/N6](n5-n6/README.md) |
| Combined final patch | — | 43 pass / 8 files | [Combined test run](after-all.txt) |

The patch preserves invoice URL filters from desktop/mobile, blocks the status action when the existing transition list is empty, stores calendar date/view/range in the URL with a session fallback, returns booking details to their calendar origin, and keeps range controls mounted while loading. Shared Link props now accept the custom router state already supported at runtime.

[Lint](lint.txt) covers all changed TypeScript source/tests. [Typecheck](typecheck.txt) covers the worktree. Build and final integration validation belong to the parent branch.

Dependencies are supplied by a local `node_modules` junction. Sandbox restrictions initially blocked junction creation, temporary-directory renames, and some dependency reads. The junction and offline test/type/lint commands received explicit tool escalation; writable TEMP/TMP paths were set inside this worktree. No browser, network, database, permission migration, deploy, push, PR, or merge action was performed in this block.
