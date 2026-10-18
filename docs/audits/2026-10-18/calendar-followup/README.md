# N5 published follow-up: pending sibling navigation

Base/runtime candidate: main `89967ae5768cf23d18d65c975d2cc0ac13031cb4` (PR 274). Browser QA reported the correct November reservation opening with October query parameters, then returning to Reservas in desktop and mobile. It also reported calendar parameters appended to Panel.

Read-only QA source: `C:/Users/torta/Documents/Codex/2026-10-17/task-11/qa-pr274-published-n4-n5-n6.json`. SHA-256: `69F8DF70876571CC1D8E0965E21E0BCC1D9D9D9F6B2F557EC3A7D720704567EE`. This follow-up did not operate a browser, modify that QA file, publish, or make business-data changes.

## Reproduced cause

`CalendarPage.pending-navigation.test.tsx` uses real TanStack memory history with separate sibling routes and a controlled pending loader. The real CalendarPage, toolbar, GanttCard/GanttRow, booking action, BookingDetail, detail header and router compatibility hooks remain in the test. Data queries, unrelated summary widgets and the outer chart data layout are mocked. No navigation function is mocked.

1. Calendar opens at October/Gantt/Mes; its real next-month control selects November. Opening the real Gantt reservation action navigates to a detail route whose loader is pending. TanStack commits the destination location while keeping the previous calendar screen mounted.
2. `useCalendarLocationState` reads the destination's now-empty global query. Its mount-time session fallback yields October and the default viewport view (Gantt on desktop, Lista on mobile).
3. Its unscoped normalization effect writes that fallback into calendar session state, then calls `setParams`.
4. The compatibility setter reads **the live destination pathname** and replaces its query without the custom `calendarReturnTo` state. The detail now has October parameters and no origin.
5. The real BookingDetail falls back to `/bookings`; its header restores the previous booking-list filters, reproducing `/bookings?status=completed`. The same effect also contaminates a pending Panel route.

These observations reproduce the QA symptoms; this is not typed-search stripping or an incorrect reservation query. The previous `TestRouter`/Harness tests switched the screen immediately from global pathname and did not exercise the pending-route interval.

## Fix and evidence

The parent owns the product patch: scope calendar normalization and update actions to `/calendar`, and pass an opt-in `expectedPathname` checked against the live pathname in the query setter. This second check protects a callback captured before navigation, independently of a later render guard. Other setter callers retain their existing behavior.

| Run | Result | Evidence |
| --- | --- | --- |
| Published-main source, real pending sibling routes | 3 fail: desktop/mobile origin loss and Panel contamination | `before-pending-router.txt` |
| Parent patch plus pending-route, calendar, booking and compatibility regression files | 29 pass / 4 files | `after-with-regressions.txt` |
| ESLint: the two product files and new test | exit 0, no warnings | `lint.txt` |
| Typecheck | see explicit exit code | `typecheck.txt` |
| Client/SSR build on final patch | exit 0; local loopback app URL, no deploy | `build.txt` |
| Release 8.44.8 / changelog validation | exit 0, 1240 entries | `changelog.txt` |

The final two booking cases additionally call a raw query setter captured on the calendar after the destination navigation starts. They assert that `expectedPathname` leaves both destination href and state untouched. This extra stale-callback assertion was added after the initial three-case red reproduction; the baseline log already demonstrates all three lifecycle failures independently.

Commands (offline dependency runtime, fixture-only queries):

```powershell
$env:TEMP = Join-Path (Get-Location) 'docs/audits/2026-10-18/calendar-followup/.tmp'
$env:TMP = $env:TEMP
node node_modules/vitest/vitest.mjs run src/features/calendar/pages/__tests__/CalendarPage.pending-navigation.test.tsx --maxWorkers=1
node node_modules/vitest/vitest.mjs run src/features/calendar/pages/__tests__/CalendarPage.pending-navigation.test.tsx src/features/calendar/pages/__tests__/CalendarPage.navigation.test.tsx src/features/bookings/pages/__tests__/BookingDetail.test.tsx src/lib/__tests__/routerCompatLocation.test.tsx --maxWorkers=2
node node_modules/eslint/bin/eslint.js src/features/calendar/hooks/useCalendarLocationState.ts src/lib/router-compat.ts src/features/calendar/pages/__tests__/CalendarPage.pending-navigation.test.tsx
node node_modules/typescript/bin/tsc --noEmit
```

Source edits in this worktree belong to the parent. This subagent wrote only the new test and this evidence directory. A local dependency junction and offline commands used tool escalation for dependency access. Build, CI, review and renewed published QA remain with the parent; no browser or database access was used here.
