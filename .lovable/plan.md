

# Refactorizacion y estandarizacion del codigo

## Hallazgos

Despues de analizar todo el codigo, se identificaron los siguientes patrones inconsistentes y oportunidades de mejora:

### 1. Paginas de lista que NO usan `ListPageLayout`

Ya migradas: `QuotesPage`, `Fleet`, `CustomersPage`, `DamageTrackingPage`

Pendientes de migrar:
- **InvoicesPage** - Construye manualmente PageTransition, PageHeader, Card, Table, TablePagination
- **ContractsPage** - Mismo patron manual
- **AuditTrailPage** - Mismo patron manual
- **MaintenancePage** - Mismo patron manual, sin paginacion visible
- **DeliveriesPage** - Mismo patron manual, sin paginacion
- **ReturnInspectionPage** - Mismo patron manual, sin paginacion

### 2. Hook `useListFilters` subutilizado

El hook ya existe y encapsula busqueda + filtro de estado con `useMemo`. Sin embargo, solo lo usan `QuotesPage` y `DamageTrackingPage`. Las demas paginas reimplementan la misma logica manualmente con `useState` + `.filter()` sin memoizacion.

### 3. Componente `SearchBar` subutilizado

El componente `SearchBar` existe, pero la mayoria de las paginas recrean manualmente el Input con el icono Search posicionado absolutamente.

### 4. Vista mobile duplicada

`InvoicesPage` y `ContractsPage` tienen bloques de cards para mobile identicos en estructura. `ListPageLayout` ya soporta `customContent` para este caso (como lo hace `Fleet`).

## Plan de implementacion

### Paso 1: Migrar `InvoicesPage` a `ListPageLayout` + `useListFilters`

- Reemplazar el layout manual por `ListPageLayout`
- Usar `useListFilters` para busqueda y filtro por status (reemplazando los `useState` + `filter` manuales)
- Mover los Tabs de status a la prop `filters`
- Usar `customContent` para la vista mobile (cards)
- Usar `SearchBar` en vez del Input manual

### Paso 2: Migrar `ContractsPage` a `ListPageLayout` + `useListFilters`

- Mismo patron que InvoicesPage
- Usar `useListFilters` con `searchFields: ["contract_number", "customer_name"]` y `statusField: "status"`
- Usar `customContent` para la vista mobile

### Paso 3: Migrar `MaintenancePage` a `ListPageLayout` + `useListFilters`

- Reemplazar layout manual
- Adaptar `useListFilters` -- esta pagina filtra por `forklift_id` en vez de status, se usara un filtro adicional fuera del hook
- Mover el Dialog de creacion fuera del layout (como `CustomersPage`)
- Usar `SearchBar`

### Paso 4: Migrar `DeliveriesPage` a `ListPageLayout`

- Reemplazar layout manual
- Agregar paginacion (actualmente no tiene)
- Mover el Dialog de creacion fuera del layout

### Paso 5: Migrar `ReturnInspectionPage` a `ListPageLayout`

- Reemplazar layout manual
- Agregar paginacion
- Mover el Dialog de creacion fuera del layout

### Paso 6: Migrar `AuditTrailPage` a `ListPageLayout`

- Reemplazar layout manual
- Mover filtros (tabla + search) a la prop `filters`
- Mantener el Dialog de detalle fuera del layout

## Detalles tecnicos

Cada migracion sigue el mismo patron establecido:

```text
ANTES (manual):
  PageTransition > div > PageHeader > filtros > Card > CardContent > Table > TablePagination

DESPUES (estandarizado):
  ListPageLayout(title, subtitle, actions, filters, isLoading, items, ...)
```

**Beneficios:**
- Elimina ~30-50 lineas de boilerplate por pagina
- Consistencia visual garantizada (padding, spacing, estructura)
- Paginacion incluida automaticamente
- Un solo lugar para cambiar el layout de todas las listas

**Riesgo:** Bajo. `ListPageLayout` ya esta probado en 4 paginas. Las paginas con Dialogs (Maintenance, Deliveries, Returns) simplemente envuelven el `ListPageLayout` en un Fragment y agregan el Dialog despues, como ya lo hace `CustomersPage`.

