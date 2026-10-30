# Isolated quote visual checks

Run only after the coordinated fake-backend production build has finished.
This config does not build automatically and refuses to start without
`SMOKE_REUSE_BUILD=1`; it inherits the smoke fake-build validation.

```powershell
$env:SMOKE_REUSE_BUILD = '1'
node node_modules/@playwright/test/cli.js test --config playwright.quotes-design.config.ts
```

The suite uses one worker and a fresh isolated preview at
`http://127.0.0.1:4187`, through the isolated browser proxy on port 4188. It covers 21 cases: seven
scenarios at 1440×1000, 360×800 and 390×800. No submit, status, conversion,
deletion or other application write action is clicked.

All identities and rows are synthetic local fixtures. The transport aborts
external requests, websockets, unexpected server functions and all writes.
Only the two named GET server functions, enumerated REST GET tables, the
synthetic local user GET, and three named read-only RPCs can return fixtures.
The synthetic local session does not authenticate against a service.

Scenarios cover rental and sale capture with MXN→USD switches preserving
entered values, long model identity, net amounts, summary position, one
mounted submit, footer visibility, accepted lock, existing detail cards with
seven lines and both discount types, read permissions, cancel/back and the
unsaved changes guard. The 430px reduced viewport approximates available
space while a mobile keyboard is open; it is not a native OS keyboard test.

Viewport screenshots and JSON geometry/network ledgers are written to
`test-results/quotes-design/evidence/`. Failures keep traces under
`test-results/quotes-design/`; the HTML report is in
`playwright-report/quotes-design/`. These paths are already ignored by Git
and uploaded by CI. CI uses Playwright's managed Chromium; set
`SMOKE_CHROMIUM_PATH` only when selecting an installed local Chromium.
