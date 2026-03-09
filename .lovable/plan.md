

# Plan: Agregar columna "No. de Serie" a la tabla de Flota

## Cambio
Agregar la columna "No. de Serie" (`serial_number`) a la tabla de inventario de flota, entre "Fabricante" y "Capacidad".

## Detalle técnico

### `src/pages/Fleet.tsx`
- Agregar accessor `serial_number` en el objeto `accessors` del `useListPage`: `serial_number: (f) => f.serial_number || ""`
- Agregar `<SortableTableHead>` para "No. de Serie" después de "Fabricante"
- Agregar `<TableCell>` con `f.serial_number || "—"` en `renderRow`
- Incluir serial_number en el CSV export
- Incluir serial_number en la búsqueda
- Mostrar serial_number en las mobile cards
- Actualizar `skeletonColumns` de 7 a 8

