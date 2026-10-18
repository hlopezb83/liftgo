# Calendar navigation and focus: N5 / N6

Audited base: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.

| Case | Audited behavior | Corrected behavior |
| --- | --- | --- |
| November Gantt → booking → Volver | Booking detail returns to `/bookings`. The calendar loses its period and view when remounted. | The Gantt passes its calendar origin in router history state; booking detail validates and uses that exact local URL. |
| Calendar URL / bare reentry | Calendar ignores its URL and resets date/view/range. | `date=YYYY-MM-DD`, `view=gantt|list`, and `range=month|week` own the calendar state. A bare reentry restores the session state. Explicit URLs override that fallback, including on mobile. |
| Loading another range | The entire page becomes a skeleton and the focused next-period button is removed. | Toolbar and Gantt header stay mounted. Only range content shows its loading status. Independent current-fleet summary data stays visible. |

`before.txt`: **6 failed / 5 passed**. `after.txt`: **11 passed**. `../after-all.txt` verifies the final combined navigation patch: **43 passed across 8 files**.

The baseline replaced only the five production files listed in `baseline-source-hashes.txt` with their audited Git blobs, verified every blob hash, ran the same tests, then restored the corrected files in a `finally` block. The new calendar-state hook was unused by the baseline source. The shared detail header enhancement from N1 does not affect the baseline failure: audited BookingDetail explicitly returns to `/bookings`.

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp-vitest'
$env:TMP = $env:TEMP
node node_modules/vitest/vitest.mjs run `
  src/features/calendar/pages/__tests__/CalendarPage.navigation.test.tsx `
  src/features/bookings/pages/__tests__/BookingDetail.test.tsx `
  --maxWorkers=2
```

Tests exercise actual router navigation, the real Gantt booking action and detail header, a mobile viewport, session reentry, rejection of external/malformed return paths, and DOM identity plus keyboard focus during and after a pending request in both views. Data queries are mocked; the suite network barrier remains enabled. No browser or published database was used.
