## Diagnóstico

El CI falla en el step de **Knip** (no en lint ni tests). Knip detectó código muerto y sale con código 1:

**Archivos no usados (2):**
- `src/components/SortableTableHead.tsx`
- `src/features/audit/components/auditTrail/AuditLogTableRow.tsx`

**Exports no usados (4):**
- `FleetTableRow` en `src/features/fleet/components/fleet/FleetRowAndCard.tsx`
- `MaintenanceTableRow` en `src/features/maintenance/components/maintenance/MaintenanceRow.tsx`
- `maintenanceSortAccessors` en `src/features/maintenance/lib/maintenancePageHelpers.ts`
- `UserDesktopRow` en `src/features/users/components/users/UserDesktopRow.tsx`

Verifiqué con ripgrep que ninguno tiene referencias fuera de su propio archivo.

## Plan

1. **Eliminar archivos no usados**
   - `SortableTableHead.tsx` (reemplazado hace tiempo por `useSort` + headers inline)
   - `AuditLogTableRow.tsx`

2. **Eliminar exports/funciones no usadas**
   - `FleetRowAndCard.tsx`: quitar el componente `FleetTableRow` (mantener `FleetMobileCard` u otros si se usan)
   - `MaintenanceRow.tsx`: quitar `MaintenanceTableRow` (si queda vacío, eliminar el archivo)
   - `UserDesktopRow.tsx`: si solo exporta el componente no usado, eliminar el archivo completo
   - `maintenancePageHelpers.ts`: quitar `maintenanceSortAccessors`

3. **Verificación**
   - `bun run knip` → 0 errores
   - `bun run lint` → sin nuevos errores
   - `bun run test` → 296 tests pasando

4. **Changelog**
   - Agregar `v6.12.3` (patch): "Limpieza de código muerto detectado por Knip para arreglar CI"
