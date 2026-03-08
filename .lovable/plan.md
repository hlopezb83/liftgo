

## Plan: Agregar filtro de fecha a la tabla de Devoluciones (v3.19.6)

### Cambios

**`src/pages/ReturnInspectionPage.tsx`**

- Agregar estado `filterDate` (`Date | undefined`) para filtrar inspecciones por fecha.
- Importar `DatePickerField` existente.
- Filtrar `inspections` antes de pasarlas a `useListPage`: si `filterDate` está definido, solo mostrar inspecciones cuyo `inspected_at` coincida con esa fecha.
- Pasar el `DatePickerField` como prop `filters` del `ListPageLayout`, junto con un botón para limpiar el filtro.

**`src/lib/changelog.ts`** — v3.19.6

### Archivos
- **Editar**: `src/pages/ReturnInspectionPage.tsx`, `src/lib/changelog.ts`

