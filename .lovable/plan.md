

# Plan: Quitar columnas de la tabla de Flota

Eliminar las columnas "Fabricante", "Capacidad" y "Altura" de la tabla de inventario de flota.

## `src/pages/Fleet.tsx`
- Quitar los accessors `manufacturer`, `capacity_kg`, `mast_height_m` del `useListPage`
- Quitar los 3 `<SortableTableHead>` correspondientes
- Quitar las 3 `<TableCell>` en `renderRow`
- Quitar esos campos del CSV export
- Quitar esos datos de las mobile cards
- Actualizar `skeletonColumns` de 8 a 5

