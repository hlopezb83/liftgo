
## Auditoría: filtros en tablas de la app

### Estado actual (5 patrones distintos coexistiendo)

| Patrón | Ubicación | Storage | Búsqueda | Facetas | Notas |
|---|---|---|---|---|---|
| **A. `useListFilters`** (canónico) | `src/hooks/useListFilters.ts` | URL (`?q`, `?status`) + sessionStorage por pathname | `match-sorter` + `useDeferredValue` | 1 status | Filtrado **cliente** sobre lo ya cargado |
| **B. `useInvoicesFilters`** | `src/features/invoices/hooks/invoices/useInvoicesFilters.ts` | URL (`?q`, `?status`, `?from`, `?to`) | Server-side vía `queryFilters` | status + rango fechas | Único que filtra **en Supabase antes del `.limit()`** (v7.61.9) |
| **C. `useAccountsPayableFilters`** | `src/features/accounts-payable/hooks/...` | `useState` local | `.includes()` | status, proveedor, categoría, mes, aprobación, REP | 7 facetas, no persiste en URL |
| **D. Ad-hoc `useState + .filter()`** | `SuppliersPage`, `AuditTrailPage`, `ChangelogPage` | `useState` local | `.includes()` a mano | 0-2 | Cada uno reinventa la rueda |
| **E. Hooks propios por feature** | `useUserManagementFilters`, `useInventoryFilters`, `useCrmClosedFilters` | Mixto | Mixto | Custom | Fachadas sobre A con nombres distintos |

### Problemas concretos

1. **UX inconsistente**: unas tablas conservan filtros al volver (sessionStorage en A), otras los pierden (C/D). Compartir URL con filtros solo funciona en A y B.
2. **Búsqueda desigual**: `match-sorter` (fuzzy, ranking) en A vs `.toLowerCase().includes()` en C/D. El usuario percibe que "el buscador se comporta distinto".
3. **Facetas duplicadas**: cada feature reimplementa `hasActive`, `reset`, `filterKey`, tabs de status. C tiene 7 facetas ricas que ninguna otra tabla puede reutilizar.
4. **Riesgo de límite de filas**: A/C/D filtran cliente sobre las primeras 500 filas. Solo B filtra en servidor. El bug de Facturas (v7.61.9) puede replicarse en cualquier tabla que crezca.
5. **React Compiler traps**: A usa `useDeferredValue`; C/D no. El comportamiento de "congelamiento tras un click" solo se ha reproducido donde el estado es un objeto no estable — hay riesgo latente en C/D.
6. **UI de filtros dispersa**: unas usan `<Tabs>` para status, otras `<Select>`, otras chips. Los placeholders del `SearchBar` son textos distintos por página.
7. **Sin contrato de "vaciar filtros"**: solo AP expone `reset` y `hasActive`. En el resto el usuario tiene que borrar campo por campo.

### Plan de estandarización (4 lotes, incrementales, sin romper features)

**Lote 1 — Definir el contrato canónico `useTableFilters`** (base)
- Nuevo hook en `src/hooks/filters/useTableFilters.ts` que absorba lo mejor de A + B + C:
  - Storage configurable: `url` (default) | `session` | `memory`.
  - Facetas declarativas: `text`, `enum` (status/categoría), `dateRange`, `month`, `entityRef` (proveedor/cliente).
  - Modo `client` (default, matchSorter) o `server` (devuelve `queryFilters` + `filterKey` estable).
  - Devuelve siempre `{ values, set, reset, hasActive, filtered?, queryFilters?, filterKey }`.
- Barrel `FiltersToolbar` en `src/components/filters/` con subcomponentes: `FiltersToolbar.Search`, `.StatusTabs`, `.StatusSelect`, `.DateRange`, `.EntityCombobox`, `.MonthPicker`, `.ClearAll`.
- Reglas UX fijas:
  - Placeholder `Buscar por {campos}…` derivado del hook.
  - Status con ≤5 opciones → `Tabs`; con >5 → `Select`.
  - Botón `Limpiar filtros` visible solo cuando `hasActive`.
  - Chips resumiendo filtros activos sobre la tabla.
- Tests unitarios + snapshot visual con Playwright de la barra en 3 configuraciones.

**Lote 2 — Migrar tablas ad-hoc (D) al contrato**
Bajo riesgo, alto retorno: `SuppliersPage`, `AuditTrailPage`, `ChangelogPage`, `CRMClosedPage`. Reemplazan `useState + .filter` por `useTableFilters` en modo cliente/URL.

**Lote 3 — Consolidar hooks fachada (E) y `useListFilters` (A)**
- Reimplementar `useUserManagementFilters`, `useInventoryFilters`, `useCrmClosedFilters`, `useMaintenance*` como wrappers finos sobre `useTableFilters`.
- Reescribir `useListFilters` como alias deprecated que llama al nuevo hook (compatibilidad de API en Bookings, Fleet, Quotes, Customers, Damage, Contracts).
- Eliminar duplicación de `matchSorter`, `useDeferredValue`, `hasActive`, `filterKey`.

**Lote 4 — Migrar Facturas (B) y Cuentas por Pagar (C) al contrato en modo server**
- `useInvoicesFilters` pasa a ser una configuración de `useTableFilters` con `mode: "server"` y adapters a `createInvoiceListFilters`.
- `useAccountsPayableFilters` gana persistencia en URL y modo server para las 7 facetas (evita el techo de 500 filas), preservando la UX de tabs actual.
- Se añade el mismo modo server a las tablas grandes candidatas (Bookings, Quotes, Customers) cuando el volumen lo justifique — decisión por tabla, no en este lote.

### Detalles técnicos

- **API propuesta** del hook:
  ```ts
  useTableFilters<T>({
    facets: {
      q:       { type: "text", fields: ["name","email"], placeholder: "Buscar…" },
      status:  { type: "enum", options: STATUS_OPTIONS, ui: "tabs" },
      month:   { type: "month", from: (r) => r.issue_date },
      supplier:{ type: "entityRef", loader: useSuppliers },
      date:    { type: "dateRange", from: (r) => r.issued_at },
    },
    storage: "url",         // "url" | "session" | "memory"
    mode:    "client",      // "client" | "server"
    items,                  // requerido en client, ignorado en server
  })
  ```
- **Estabilidad frente al React Compiler**: keys derivadas solo de primitivos (`filterKey` como string joineado), sin objetos en dependencias.
- **URL params**: convención única `?q=&status=&from=&to=&month=&supplier=` compartida por todas las páginas.
- **Persistencia**: sessionStorage por pathname sigue viva, pero centralizada en el hook (no duplicada por página).
- **Backwards compatibility**: fases 2 y 3 no cambian rutas ni contratos de páginas; fase 4 preserva los query params ya en producción para Facturas.

### Entregables por lote

```text
Lote 1 → src/hooks/filters/useTableFilters.ts
         src/components/filters/FiltersToolbar/*
         tests + docs
Lote 2 → 4 páginas migradas, 0 regresiones en URL
Lote 3 → useListFilters deprecated, hooks fachada = wrappers
Lote 4 → Invoices + AP con modo server sobre el nuevo hook
Cada lote cierra con entrada en public/changelog.
```

### Fuera de alcance

- No se toca la lógica de negocio de cada tabla (queries, RPCs, permisos).
- No se rediseña el look and feel de la barra: se estandariza usando componentes shadcn ya existentes.
- No se migra a filtrado server-side masivo: solo Invoices y AP en el lote 4; el resto queda en cliente hasta que el volumen lo requiera.
