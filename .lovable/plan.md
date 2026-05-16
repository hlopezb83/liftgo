## Limpieza de código sin uso

Ejecuté `knip` sobre el proyecto y encontré **269 archivos sin referencias**, **35 exports sin uso** y **40 tipos exportados sin uso**. La gran mayoría son *shims* de retrocompatibilidad creados durante la migración a la estructura `src/features/...` que ya nadie importa (el router y los features apuntan directo a `@/features/...`).

### Qué se eliminaría (resumen por bloques)

1. **Shims de páginas — `src/pages/*.tsx`** (~38 archivos)
   Todos son `export { default } from "@/features/.../pages/..."`. El router (`src/lib/routes-config.tsx`) ya importa directo de `@/features/...`. Se conservan los que sí se usan: `AuthPage.tsx`, `HelpPage.tsx`, `NotFound.tsx`, `portal/*`, y `__tests__/InvoicesPage.test.tsx`.

2. **Shims de componentes — `src/components/<feature>/*`** (~90 archivos)
   Re-exports de `@/features/.../components/...` sin consumidores. Incluye: `bookings/`, `booking-detail/`, `calendar/`, `changelog/`, `contracts/`, `crm/`, `customer-detail/`, `customers/`, `damage/`, `dashboard/`, `deliveries/`, `expenses/`, `forklift-detail/`, `forklift-form/`, `inventory/`, `invoice-detail/`, `invoice-form/`, `invoices/`, `maintenance/`, `users/`, `auditTrail/`, además de `DataTableSelectionToolbar.tsx`.

3. **Shims de hooks — `src/hooks/<subdir>/*` y algunos `src/hooks/use*.ts`** (~55 archivos)
   Re-exports de hooks que ya viven dentro de `src/features/.../hooks/...`. Solo se eliminan los que knip marca sin referencias (los `src/hooks/use*.ts` que sí son usados como `@/hooks/useFoo` se conservan).

4. **Duplicados reales**
   - `src/lib/pdf/invoice/build.ts` — versión vieja, la activa es `src/features/invoices/lib/pdf/build.ts`.
   - `src/features/fleet/hooks/forklifts/useForkliftOptions.ts` — sin referencias.
   - `src/features/users/components/users/RolePermissionsMatrix.tsx` — sin referencias (el módulo activo vive en otra ruta).
   - `src/features/feedback/lib/scoring.ts` — sin referencias (el cómputo se hace por RPC).
   - `scripts/split-changelog.ts` — script one-shot ya ejecutado, sin npm script asociado.
   - `src/App.css` — sin imports (los estilos viven en `src/index.css`).

5. **Exports y tipos sin uso dentro de archivos vivos** (~75 símbolos)
   Eliminar exports y tipos huérfanos en `src/components/ui/*` (alert-dialog, badge, card, chart, command, dialog, dropdown-menu, form, etc.) y en hooks/utilidades. Solo se quita lo no referenciado; los componentes se mantienen.

### Qué NO se toca

- **Edge functions** (`supabase/functions/*`) — knip las marca como huérfanas porque se invocan vía `supabase.functions.invoke(...)` en runtime. Quedan intactas.
- `src/integrations/supabase/*` (auto-generado).
- Cualquier archivo bajo `src/features/`, `src/layouts/`, `src/contexts/` que knip no marque.
- Páginas y hooks shims que sigan teniendo al menos una referencia detectada.

### Verificación post-cambio

1. Verificar que el typecheck/build pasa (lo hará el harness al guardar).
2. Re-ejecutar `npx knip --reporter compact` para confirmar la reducción.
3. Smoke test del preview: navegar dashboard, reservas, facturas, CRM (rutas críticas que usan lazy imports).

### Changelog

Agregar `v5.86.0` (minor — limpieza grande de deuda técnica) a `public/changelog.json` y `public/changelog/v5.86.0.json` describiendo:
"Eliminados ~270 archivos shim de retrocompatibilidad y exports sin uso. Sin cambios funcionales."

### Riesgo

Bajo. Todos los archivos a eliminar son re-exports sin consumidores verificados con `rg` cruzado contra todo `src/`. Si algún import dinámico oculto rompe, se restaura el shim puntual.
