

## Plan: Página de Inventario de Refacciones (v3.17.8)

### Cambios

**1. `src/lib/formSchemas.ts`** — Agregar schema `partFormSchema`
- Campos: name (requerido), sku (opcional), category (requerido, enum), stock_quantity (entero ≥ 0), min_stock_level (entero ≥ 0), unit_cost (número ≥ 0)
- Mensajes de error en español mexicano

**2. `src/pages/InventoryPage.tsx`** — Nueva página completa
- Patrón idéntico a OperatingExpensesPage: PageTransition, PageHeader, Card con tabla, SearchBar, filtro por categoría
- Columnas: SKU, Nombre, Categoría, Costo Unitario (formatCurrency), Stock
- Stock column: Badge destructive `"[X] - Reabastecer"` si `stock_quantity <= min_stock_level`, Badge secondary/verde si OK
- Botón "Nueva Refacción" abre dialog con react-hook-form + zodResolver
- Campos del dialog: Nombre*, SKU, Categoría* (Select: Filtros, Llantas, Aceites, Baterías, Otros), Stock Inicial, Stock Mínimo, Costo Unitario
- Acciones por fila: editar, eliminar
- Usa hooks de `usePartsInventory`

**3. `src/App.tsx`** — Agregar ruta `/inventory` con roles `["admin", "administrativo", "mechanic", "auditor"]`

**4. `src/components/AppSidebar.tsx`** — Nueva sección "Inventario" con icono Package, enlace a `/inventory`

**5. `src/lib/changelog.ts`** — v3.17.8

