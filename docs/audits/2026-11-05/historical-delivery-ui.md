# Historical delivery reconciliation UI

The deliveries query loads the RLS-visible administrative ledger in the same request as each delivery. An unavailable ledger fails the query instead of treating historical records as operational work. Apply migration 0126 before deploying this UI.

- Default view excludes active historical reconciliations. The selector exposes full history and reconciled-only records. Search, status, type and history reset together through the URL filter hook.
- Original logistical status remains visible. Reconciliation is a separate badge in desktop rows, mobile cards and reservation transports.
- Detail shows classification, authorized reference date, basis, reason and the safe evidence description. It does not invent a completion timestamp, signature or physical movement.
- Active reconciliations do not generate overdue badges/counts or expose complete, reschedule, delete, correction or void actions. Revoked reconciliations remain visible as revoked and regain normal operational behavior.
- No client writes or RPC are introduced. Supabase generated types are unchanged.

## Validation

117 focused Vitest tests passed (delivery feature and reservation transport card). Main TypeScript check, browser-test TypeScript check, scoped ESLint and architecture check passed. Production build passed through `npm run build` (existing dependency fontkit warnings remain).

A synthetic browser fixture and Playwright desktop/mobile tests are included. Actual execution is blocked in this executor: Chromium fails before opening the page with `socket() failed: Operation not permitted`, including the permitted escalated attempt. No visual or live eight-record verification is claimed here. Run `SMOKE_CHROMIUM_PATH=/path/to/chromium npx playwright test --config playwright.historical-deliveries.config.ts` in an executor that supports Chromium; the fixture blocks external network access and uses synthetic data only.
