Plan: Dependency hygiene — safe minor/patch updates

Objective
Update all npm dependencies that have a safe minor or patch release available, while keeping major-version bumps (Tailwind 4, React Router 7, Zod 4, Sonner 2, etc.) out of scope. Reduce bug-fix and performance debt without introducing breaking changes.

Scope
- Update only packages where the "Update" column in `bun outdated` is higher than "Current" but stays within the same major version line.
- Exclude major-version migrations and intentionally pinned packages:
  - `jspdf` / `jspdf-autotable` remain locked at ≤4.0.0 per project memory.
  - No Tailwind 4, React Router 7, Zod 4, TypeScript 7, Vite 8, Sonner 2, date-fns 4, etc.

Packages to update
Production (18 packages):
- @radix-ui/react-accordion 1.2.14 → 1.2.16
- @radix-ui/react-alert-dialog 1.1.17 → 1.1.19
- @radix-ui/react-checkbox 1.3.5 → 1.3.7
- @radix-ui/react-collapsible 1.1.14 → 1.1.16
- @radix-ui/react-dialog 1.1.17 → 1.1.19
- @radix-ui/react-dropdown-menu 2.1.18 → 2.1.20
- @radix-ui/react-label 2.1.10 → 2.1.11
- @radix-ui/react-popover 1.1.17 → 1.1.19
- @radix-ui/react-scroll-area 1.2.12 → 1.2.14
- @radix-ui/react-select 2.3.1 → 2.3.3
- @radix-ui/react-separator 1.1.10 → 1.1.11
- @radix-ui/react-switch 1.3.1 → 1.3.3
- @radix-ui/react-tabs 1.1.15 → 1.1.17
- @radix-ui/react-toggle 1.1.12 → 1.1.14
- @radix-ui/react-toggle-group 1.1.13 → 1.1.15
- @radix-ui/react-tooltip 1.2.10 → 1.2.12
- @sentry/react 10.64.0 → 10.65.0
- @supabase/supabase-js 2.108.2 → 2.110.2
- @tanstack/react-query 5.101.1 → 5.101.2
- @tanstack/react-virtual 3.14.4 → 3.14.5
- react-hook-form 7.80.0 → 7.81.0
- recharts 3.8.1 → 3.9.2

Development (10 packages):
- @eslint/js 9.39.4 → 9.39.5
- @sentry/vite-plugin 5.3.0 → 5.4.0
- @types/node 22.20.0 → 22.20.1
- @vitest/coverage-v8 4.0.18 → 4.1.10
- eslint 9.39.4 → 9.39.5
- knip 6.22.0 → 6.26.0
- lovable-tagger 1.3.0 → 1.3.1
- postcss 8.5.15 → 8.5.16
- typescript-eslint 8.62.0 → 8.63.0
- vitest 4.1.9 → 4.1.10

Execution approach
1. Run `bun update` for the safe set in two batches:
   - Batch A: Radix UI primitives (single command, they share internals).
   - Batch B: Remaining production + dev dependencies.
2. After each batch run the verification gate.
3. If a batch introduces failures, roll back that batch and document the blocker.

Verification gate (after each batch)
- `bun install` / lockfile consistency check.
- `npx tsgo --noEmit` (typecheck).
- `bun run lint` (ESLint 0 warnings target).
- `bunx vitest run` (804 tests baseline).
- `bun run test:e2e` smoke navigation spec.
- `ANALYZE=1 bun run build` to confirm bundle size did not regress.

Risk and rollback
- Low risk: all updates are within the same major version line.
- If any update breaks the build or tests, revert the specific package to its previous version and continue with the rest.

Deliverables
- Updated `package.json` and lockfile.
- New changelog entry `v7.6.0` describing the dependency hygiene batch.
- Report of any packages that could not be updated and why.