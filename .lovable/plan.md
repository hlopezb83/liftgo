

# Plan: Persistir filtros con URL search params en todas las páginas de listado

## Páginas a modificar

6 páginas usan `useListFilters` con estado local que se pierde al navegar. Aplicaremos el mismo patrón de `Fleet.tsx` (`useSearchParams` + `useCallback`):

| Página | Filtros | Archivo |
|--------|---------|---------|
| Facturas | search + status | `src/pages/InvoicesPage.tsx` |
| Cotizaciones | search + status | `src/pages/QuotesPage.tsx` |
| Reservas | search + status | `src/pages/BookingsPage.tsx` |
| Contratos | search + status | `src/pages/ContractsPage.tsx` |
| Mantenimiento | search (sin status tab) | `src/pages/MaintenancePage.tsx` |
| Daños | search + status | `src/pages/DamageTrackingPage.tsx` |

Adicionalmente, **Clientes** (`src/pages/CustomersPage.tsx`) ya tiene `useSearchParams` pero lo usa solo para conversión de prospectos — su `search` es `useState` local, así que también se migra.

## Cambio por página

1. Importar `useSearchParams` y `useCallback` de react-router-dom/react
2. Reemplazar `useListFilters` (o `useState` para search) por:
   - Leer `search` de `searchParams.get("q")`
   - Leer `statusFilter` de `searchParams.get("status")`
   - `setSearch` / `setStatusFilter` actualizan los params con `replace: true`
3. Mantener la lógica de filtrado inline (ya que `useListFilters` se deja de usar)

## Refactor opcional del hook

Alternativamente, se puede **modificar `useListFilters`** para que internamente use `useSearchParams` en lugar de `useState`. Esto evita repetir el patrón en cada página y mantiene el código DRY. Todas las páginas que ya lo usan se benefician automáticamente.

**Enfoque elegido**: Modificar `useListFilters` para usar `useSearchParams` internamente. Una sola edición en `src/hooks/useListFilters.ts` corrige las 6 páginas que lo consumen. Para `CustomersPage.tsx` se migra su `useState` de search a usar el hook actualizado.

## Archivos a editar

1. **`src/hooks/useListFilters.ts`** — Reemplazar `useState` por `useSearchParams` para `search` y `statusFilter`
2. **`src/pages/CustomersPage.tsx`** — Migrar de `useState` de search a `useListFilters` actualizado (o al mismo patrón de searchParams)
3. **`src/lib/changelog.ts`** — Documentar el cambio

