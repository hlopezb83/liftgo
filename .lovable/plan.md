# Plan: Unificación de tablas (3 Fases)

Objetivo: una sola fuente de verdad para tablas (`useLiftgoTable` + `DataTableV2`), con `ListPageLayout` como shell puro. Cada fase es independiente, verificable y reversible.

---

## Fase A — Refactor interno de `useListPage` (invisible)

**Meta:** eliminar la duplicación del motor TanStack sin tocar ninguna página.

**Cambios:**
1. Reescribir `useListPage` para que internamente instancie `useLiftgoTable` en lugar de `useReactTable` directo.
2. Conservar 100% el API público actual (`renderRow`, `tableHeader`, `accessors`, `data`, `pagination`).
3. Mapear `accessors` actuales → `ColumnDef<T>[]` mínimos internamente (solo para el motor; el render sigue siendo `renderRow`).
4. Verificar con `bunx vitest run` y revisión visual de 3 páginas representativas (Invoices, Bookings, Customers).

**Entregables:**
- `src/hooks/useListPage.ts` refactorizado
- `public/changelog/v6.10.6.json` (patch — refactor interno)
- Cero cambios en páginas

**Riesgo:** Bajo. Si algo falla, revert de un solo archivo.

**Tamaño estimado:** ~1 sesión (~30 min).

---

## Fase B — Migración progresiva de páginas (oportunista)

**Meta:** cada página migra de `renderRow` → `ColumnDef<T>[]` + `DataTableV2` **solo cuando se toque por otra razón** (feature, bug, refinamiento).

**Reglas:**
1. **No** sprint dedicado. Migración piggyback.
2. Cuando una página se modifique:
   - Convertir `accessors` + `renderRow` → `columns: ColumnDef<T>[]` con `cell:` por columna.
   - Reemplazar `<ListPageLayout renderRow=…>` por `<ListPageLayout><DataTableV2 .../></ListPageLayout>`.
   - Mantener `useListFilters` + `usePagination` igual.
   - Mantener `MobileCardList` igual (o migrar a `mobileCardRender` de `DataTableV2` si encaja).
3. Cada migración = changelog patch independiente + tests verdes.
4. Trackeo: añadir comentario `// TODO: migrar a DataTableV2` en las 17 páginas pendientes para visibilidad.

**Orden sugerido cuando toque:**
- Páginas simples primero (Suppliers, Inventory, Customers).
- Páginas complejas al final (Bookings, Quotes, Invoices con filas custom).

**Entregables por página:**
- Página refactorizada
- Entrada en changelog (patch)

**Riesgo:** Medio por página, pero aislado. Visual regression posible — verificar cada una en preview.

**Tamaño estimado:** 17 páginas × ~15 min = repartido a lo largo del tiempo, sin bloqueo.

---

## Fase C — Deprecación del API antiguo

**Meta:** eliminar `renderRow` / `tableHeader` / `accessors` de `useListPage` y `ListPageLayout`.

**Precondición:** las 17 páginas ya migradas (Fase B completa).

**Cambios:**
1. Eliminar las props legacy de `ListPageLayout` (`renderRow`, `tableHeader`, `accessors`).
2. Reducir `useListPage` a: shell state (filters, pagination, mobile, empty state). El motor de tabla deja de vivir aquí — las páginas pasan `columns` directamente a `DataTableV2`.
3. Considerar renombrar `useListPage` → `useListPageShell` para reflejar el nuevo scope.
4. Actualizar `mem://arch/ui/patterns` y `mem://arch/ui/tables` con la nueva guía.
5. Changelog **minor** (6.11.0) — breaking interno.

**Entregables:**
- `useListPage` / `ListPageLayout` simplificados
- Memoria actualizada
- `public/changelog/v6.11.0.json`

**Riesgo:** Bajo si Fase B está realmente completa. Test suite + smoke test de cada página.

**Tamaño estimado:** ~1 sesión.

---

## Detalles técnicos

**Mapping `renderRow` → `ColumnDef`:**
```ts
// Antes
accessors: { name: (r) => r.name, total: (r) => r.total }
renderRow: (r) => <TableRow><TableCell>{r.name}</TableCell>...</TableRow>

// Después
const columns: ColumnDef<Invoice>[] = [
  { id: 'name', header: 'Nombre', accessorKey: 'name' },
  { id: 'total', header: 'Total',
    cell: ({ row }) => <CurrencyCell value={row.original.total} /> },
];
```

**Shell final:**
```tsx
<ListPageLayout title="…" filters={…} pagination={…}>
  <DataTableV2 columns={columns} data={paginated} mobileCardRender={…} />
</ListPageLayout>
```

**Compatibilidad:** Durante Fase B coexisten ambos modos (legacy `renderRow` y nuevo `DataTableV2`) en el mismo `ListPageLayout`. Fase C remueve el legacy.

**Cumplimiento Power of 10:** el refactor reduce LOC de `useListPage` (hoy >80) por debajo del límite al delegar el motor a `useLiftgoTable`.

---

## Recomendación de ejecución

Aprobar e implementar **solo Fase A ahora**. Fase B es continua (no requiere aprobación dedicada). Fase C se replanifica cuando Fase B esté completa.
