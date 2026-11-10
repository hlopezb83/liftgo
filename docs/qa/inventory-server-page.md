# Inventory server pagination (candidate 0132)

## Scope and deployment order

Fix Control de Refacciones only. Apply reviewed migration 0132 before publishing this frontend. No migration has been applied by this change. It depends on the existing natural-order collation and organization helper from 0129/0031. It adds no business writes or policies. The RPC is SECURITY INVOKER, authenticated-only, validates the current internal organization and effective Refacciones read/full permission, and retains table RLS. A supplied organization is an assertion, not an authority.

Pagination, literal name/SKU search, category filtering and allowed-column sorting execute on the server. Filtered count and page use one statement; lowStockCount covers every active row visible to this tenant under RLS regardless of filters. An empty filtered result can therefore still show low stock. Natural sorting and deterministic ID ties are retained. The inspector retrieves its selected ID independently of page/filter changes; invalidation still uses the existing inventory root key. Errors do not fall back to a truncated list or show a successful zero KPI.

Legacy usePartsInventory and its maintenance/activation consumers are intentionally unchanged. Their existing limited selector datasets remain a separate scope. No global truncation notice was modified.

## Verification

- Synthetic 501-row inventory: item 501 is the only low-stock item. Last page, SKU/category search, empty searches and global KPI covered.
- Disposable PostgreSQL integration: ten tests cover paging/clamping, natural sorting, literal wildcard input, category, tenant A/B, RLS-hidden and inactive rows, effective permission denial, invalid parameters and INVOKER/ACL. This focused schema is not a complete migration replay.
- Frontend tests cover real Supabase SDK transport, tenant-key changes, malformed/cross-tenant responses, absent authentication, root invalidation and selected-ID refresh. Existing maintenance/inventory tests are retained.
- Offline browser acceptance is wired into CI for 1440, 360 and 390 widths with synthetic identity and 501 rows. The shared harness blocks real endpoints and mutations. Local browser execution is not accredited until a supported Chromium runtime can launch.

Commands:

    RUN_LOCAL_INVENTORY_TESTS=1 PG_BIN=/path/to/postgresql/bin node scripts/tests/inventory/run-local-postgres.mjs
    vitest run src/features/inventory src/features/maintenance/components/maintenance/__tests__
    node scripts/browser-test-server.mjs --build-only
    SMOKE_REUSE_BUILD=1 playwright test --config playwright.inventory-design.config.ts

Full-schema migration replay and all repository CI gates are required before rollout. No production data, fiscal operation, or authenticated production browser acceptance is represented by these fixtures.
