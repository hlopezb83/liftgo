

## Editar, borrar y drill-down en Mantenimiento

### Resumen

Agregar funcionalidad de drill-down al hacer clic en una fila de la tabla de mantenimiento, abriendo un panel lateral (Sheet) con los detalles completos, botones de editar y eliminar.

### Cambios

**1. `src/hooks/useMaintenanceLogs.ts`**
- Agregar hook `useDeleteMaintenanceLog` con mutación DELETE + invalidación de queries + toast de error.

**2. `src/pages/MaintenancePage.tsx`**
- Agregar estado `selectedLog` para controlar el panel de detalle.
- Agregar estado `editingLog` para el diálogo de edición (reutiliza el diálogo existente con campos pre-llenados).
- Hacer las filas de la tabla clickeables (`onClick → setSelectedLog`), también las cards móviles.
- Importar y renderizar un nuevo componente `MaintenanceDetailSheet`.
- Refactorizar el diálogo de formulario para soportar modo edición (submit llama `updateLog` en vez de `createLog`, título cambia a "Editar Mantenimiento").

**3. `src/components/maintenance/MaintenanceDetailSheet.tsx`** (nuevo)
- Panel lateral (Sheet) que muestra:
  - Tipo de servicio, montacargas, fecha, realizado por, costo, descripción, proveedor, próximo servicio, estado de trabajo.
  - Sección de refacciones (`MaintenancePartsSection`).
  - Botón "Editar" → abre diálogo de edición con datos pre-llenados.
  - Botón "Eliminar" → confirmación con AlertDialog → ejecuta delete → cierra sheet.
- Protegido con `RoleGuard` para editar/borrar (módulo "Mantenimiento", acceso "full").

### Archivos a modificar
- `src/hooks/useMaintenanceLogs.ts` — agregar `useDeleteMaintenanceLog`
- `src/pages/MaintenancePage.tsx` — estado de selección, filas clickeables, modo edición en diálogo
- `src/components/maintenance/MaintenanceDetailSheet.tsx` — nuevo componente de detalle

### Detalles técnicos

El Sheet de detalle sigue el mismo patrón que el Kanban (`MaintenanceKanban.tsx`) pero se usa desde la vista de lista. El diálogo de formulario existente se reutiliza para edición pre-llenando los campos y cambiando el submit a `useUpdateMaintenanceLog`.

