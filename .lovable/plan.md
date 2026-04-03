

## Mejoras #3, #4 y #5 — Paginar changelog, StrictMode, tipar catch

### Estado actual

- **#4 StrictMode**: Ya implementado en v5.11.0. No requiere cambios.
- **#5 catch blocks**: 4 archivos con `catch (err)` sin tipo o `catch (e: any)`:
  - `src/pages/InvoicesPage.tsx` — `catch (err)` sin tipo
  - `src/pages/MaintenancePage.tsx` — `catch (err)` sin tipo
  - `src/hooks/useQuoteDetailLogic.ts` — 2x `catch (err)` sin tipo
  - `src/components/customers/CustomerFormDialog.tsx` — `catch (e: any)` + `console.error`
  - `src/components/reports/IncomeStatementReport.tsx` — `catch (err)` + `console.error`
- **#3 Paginar changelog**: La página muestra todas las 100+ entradas sin paginación.

### Cambios

**1. `src/pages/ChangelogPage.tsx`** — Agregar paginación con `usePagination`:
- Importar `usePagination` y `TablePagination`
- Paginar las entradas filtradas (25 por página)
- Mostrar controles de paginación al final
- Resetear a página 1 al cambiar filtro

**2. Tipar catch blocks** (5 archivos):
- Cambiar `catch (err)` → `catch (err: unknown)` en InvoicesPage, MaintenancePage, useQuoteDetailLogic, IncomeStatementReport
- Cambiar `catch (e: any)` → `catch (e: unknown)` en CustomerFormDialog, ajustar acceso a `e.message`
- Eliminar `console.error` en IncomeStatementReport y CustomerFormDialog

**3. `src/lib/changelog.ts`** — Nueva entrada v5.11.1 (patch) documentando estos cambios.

### Archivos modificados
- `src/pages/ChangelogPage.tsx`
- `src/pages/InvoicesPage.tsx`
- `src/pages/MaintenancePage.tsx`
- `src/hooks/useQuoteDetailLogic.ts`
- `src/components/customers/CustomerFormDialog.tsx`
- `src/components/reports/IncomeStatementReport.tsx`
- `src/lib/changelog.ts`

