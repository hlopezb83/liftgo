
# Plan · Rendimiento R-Perf — Tanda 1 (quick wins)

Objetivo: eliminar el jank perceptible en tablas, aligerar la lista de facturas y recortar ~140 KB gz del primer paint. Cambios de bajo riesgo, verificados con `tsgo` + Vitest.

## Alcance (Tanda 1 únicamente)

Los ítems estructurales de Tanda 2 (audit trigger, RPC forklift_current_location, bail-outs React Compiler, CustomerSelector→combobox, Sentry Replay lazy, invalidaciones quirúrgicas) quedan fuera; los planteo aparte tras validar Tanda 1.

## Cambios

### 1. P0-1 · Memoizar `dataVersion` (crítico, 1 línea)
- `src/components/dataTable/v2/useLiftgoTable.ts`: envolver el `tableData.map(JSON.stringify).join("|")` en `useMemo(..., [tableData])`.
- Impacto: elimina ~95% del costo por render en TODAS las tablas (a 500 filas de facturas: 21 ms → <1 ms).
- Riesgo: nulo — TanStack Query siempre devuelve nueva referencia ante cambio de contenido; el bug R13-1 (in-place edits) ya no aplica porque los `setQueryData` del repo usan updaters inmutables.
- Verificación: `bunx vitest run src/components/dataTable/v2/__tests__/useLiftgoTable.dataVersion.test.tsx`.

### 2. P0-2 · Separar `INVOICE_LIST_COLUMNS` (sin `cfdi_xml` ni `line_items`)
- `src/features/invoices/hooks/useInvoices.ts`: nuevo array `INVOICE_LIST_COLUMNS` para `fetchInvoicePage` / lista infinita; el detalle sigue usando `INVOICE_COLUMNS` completo.
- Detalle (`useInvoice(id)`) ya re-descarga por id; `download-cfdi` sirve XML desde storage — sin regresión funcional.
- Impacto: payload lista 6-10× menor + reduce el costo residual del P0-1.

### 3. P0-3.1 · Fix chunking `recharts` (3 líneas de config)
- `vite.config.ts`: en `manualChunks`, insertar grupo `ui-utils` (`clsx`, `tailwind-merge`, `class-variance-authority`) ANTES del grupo `recharts` para que `clsx` no arrastre recharts al chunk inicial.
- Ahorro: ~109 KB gz en primer paint.

### 4. P0-3.3 · Badge de versión desde `version.json` (sin descargar changelog completo)
- `src/layouts/sidebar/SidebarBranding.tsx` (o donde consuma `useCurrentVersion`): leer versión desde `VITE_APP_VERSION` / `/version.json` (72 B) en vez de `useChangelog` (424 KB).
- `useChangelog` queda restringido a la ruta `/changelog`.
- Ahorro: 132 KB gz + 1 request de arranque.

### 5. P3-10.4 · `placeholderData: keepPreviousData` en `useInvoicesInfinite`
- 1 línea. Evita el parpadeo/vacío por keystroke.

### 6. P2-8 · `xlsx` dinámico en CxP
- `src/features/accounts-payable/...` (`downloadPaymentsXlsx`, `downloadReconciliationXlsx`): reemplazar `import` estático por `await import("@e965/xlsx")` dentro de la función.
- Ahorro: 106 KB gz fuera del chunk de la ruta.

### 7. P3-11 · Higiene assets
- `public/favicon.png`: reemplazar por versión ≤10 KB (o SVG si hay disponible).
- `index.html`: eliminar `<link rel="preconnect" href="https://cdn.gpteng.co">` (no se usa).

## Detalles técnicos

- Todo el trabajo es frontend / config Vite / assets. No hay migraciones ni cambios en RPCs ni RLS.
- Verificación por paso: `bunx tsgo`, `bunx vitest run` en archivos tocados, y `bun run build` para confirmar que `dist/assets` ya no contiene recharts en el chunk inicial (comparar `stats.html` si se genera con `ANALYZE=1`).
- Changelog: entrada `v7.230.0` (minor, agrupa perf) en `public/changelog.json` + detalle en `public/changelog/v7.230.0.json`, siguiendo la convención del proyecto.

## Fuera de alcance (Tanda 2 — pediré confirmación después)

Audit trigger sin XML (P1-4), `forklift_current_location` (P1-5), bail-outs React Compiler (P1-6), límites forklifts/supplier_bills/cash-flow (P2-7), CustomerSelector combobox (P2-9), Sentry Replay lazy (P0-3.2), consolidación company_settings + invalidaciones bookings (P3-10.1-2), lazy de diálogos (P3-11).
