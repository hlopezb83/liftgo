

## Plan: Mejorar UI de Gastos Operativos (v3.17.2)

### Cambios en `src/pages/OperatingExpensesPage.tsx`

**1. Tarjeta de resumen "Total de Gastos"**
- Card con `DollarSign` icon mostrando la suma de `filtered` usando `formatCurrency`
- Se coloca entre el `PageHeader` y la tabla

**2. Barra de filtros mejorada**
- Agregar `SearchBar` para filtrar por descripción (nuevo estado `search`)
- Mover el `Select` de categoría al mismo nivel, en una fila flex
- El filtrado aplica ambos: categoría + búsqueda por descripción (case-insensitive)

**3. Tabla mejorada**
- `isLoading` ya usa `TableSkeleton` (mantener)
- Categoría: renderizar `Badge` con variant `secondary` para `costo_venta`, `outline` para el resto
- Monto: ya usa `formatCurrency` (mantener)
- Empty state: reemplazar `EmptyState` por `EmptyRow` dentro de `TableBody` con colSpan=6 y mensaje "Sin gastos registrados" -- la tabla siempre se renderiza con headers visibles

**4. Changelog** — v3.17.2

### Archivos
1. `src/pages/OperatingExpensesPage.tsx`
2. `src/lib/changelog.ts`

