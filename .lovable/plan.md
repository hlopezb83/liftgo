# v7.226.1 — Limpieza de warnings de CI

Los 46/36 tests E2E siguen verdes; esto es puramente higiene de warnings que ruidan cada corrida.

## 1. Node 20 deprecation (7 jobs afectados)

`actions/setup-node@v4` ya corre internamente en Node 20, deprecado desde sept-2025. Se está forzando a Node 24 por el runner pero el warning se emite igual.

- **`.github/actions/setup-bun-project/action.yml`** → subir a `actions/setup-node@v5` (runtime Node 24 nativo). Sin cambios de comportamiento.

## 2. Import order / grupos vacíos (4 archivos)

Reordenar imports y quitar líneas en blanco entre grupos según regla `import/order`:

- `src/features/invoices/hooks/invoices/useInvoices.ts:3` — quitar línea vacía entre grupos.
- `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts:4` — mover `@/lib/domain/invoiceHelpers` antes de `@/lib/domain/nonRentalLines`.
- `src/features/invoices/components/invoice-form/GlobalInvoiceFields.tsx:2` — quitar línea vacía.
- `src/features/invoices/components/invoice-detail/usePaymentIntentsColumns.tsx:6` — mover el type-import antes del import de valor.
- `src/features/accounts-payable/components/RegisterSupplierPaymentDialog.tsx:11` — quitar línea vacía.

Riesgo: nulo, sólo orden de imports.

## 3. Complejidad ciclomática > 15

Tres funciones exceden el máximo de 15. Extraer subcomponentes / helpers puros; sin cambios de UX ni de datos.

- **`src/components/layout/ListPageLayout.tsx:59`** (complejidad 31) — es el layout de listado más usado. Plan: extraer los bloques condicionales de header (título/subtítulo/acciones), toolbar y estado empty/loading en subcomponentes internos (`<ListPageHeader/>`, `<ListPageToolbar/>`, `<ListPageStates/>`). API pública del componente no cambia.
- **`src/features/dashboard/pages/MrrDetailPage.tsx:15`** (complejidad 21) — extraer los `useMemo` de agregaciones a un hook `useMrrBreakdown()` y aislar los filtros a `useMrrFilters()`.
- **`src/features/deliveries/pages/DeliveryDetail.tsx:29`** (complejidad 16) — extraer un helper puro `resolveDeliveryActions(delivery, role)` que devuelva la matriz de botones, y colapsar los ternarios de estado a un `<DeliveryStatusBadge/>` local.

Riesgo: refactor interno, se cubre con los E2E de `deliveries` y `dashboard` ya existentes.

## 4. Fast refresh en `CollectionForecast.tsx`

El archivo exporta la constante-helper `amountInMxn` junto al componente, rompiendo HMR.

- Mover `amountInMxn` (y su tipo `OverdueInvoice` si aplica) a `src/features/dashboard/lib/collectionForecast.ts` y re-importar desde el componente. Cualquier otro consumidor sigue funcionando por el nuevo path.

## 5. React Compiler skip en `useLiftgoTable.ts:131`

El `// eslint-disable-next-line react-hooks/exhaustive-deps` sobre el `useMemo(Proxy)` hace que el compilador salte el archivo entero.

- Reemplazar el `useMemo` con deps derivadas por un `useMemo` con deps completas (`[table, dataVersion, sortKey, selKey, pagKey]` ya son primitivas + referencia estable de `table`). El comentario existe porque `table` cambia cada render pero el Proxy sólo debe recrearse si cambia una de las claves; se puede envolver en `useRef` + comparador manual y devolver un objeto memoizado sin necesidad de deshabilitar la regla. Alternativa segura: mover el Proxy fuera del hook y aplicarlo en el consumidor, dejando el hook devuelva `table` puro (los tests actuales cubren identidad estable).

Riesgo: medio — `useLiftgoTable` alimenta todas las tablas v2. Validar con Playwright `filters-*.spec.ts` + smoke de dashboard.

## 6. Changelog + versión

Bump a **v7.226.1** (patch), entrada en `public/changelog.json` y `public/changelog/v7.226.1.json` describiendo "Limpieza de warnings de CI (Node 20, import order, complejidad, Fast Refresh, React Compiler)".

## Verificación

1. `bunx tsgo --noEmit`
2. `bun run lint` — 0 warnings nuevos.
3. `bunx vitest run` afectados (`dashboard`, `deliveries`, `dataTable`).
4. `bunx playwright test --shard=1/2` para validar tablas v2.

## Notas técnicas

- No se toca lógica de negocio: sólo estructura de imports, extracción de subcomponentes/helpers y actualización de una action de CI.
- El upgrade a `setup-node@v5` requiere Node ≥20 en el runner, que ya cumplimos (forzamos 24).
