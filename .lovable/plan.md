

## Plan: Módulo de Control de Refacciones — Tablas e Infraestructura (v3.17.7)

### 1. Migración SQL — Crear tablas `parts_inventory` y `maintenance_parts`

**`parts_inventory`**: id (UUID PK), name (text NOT NULL), sku (text nullable), category (text NOT NULL default 'Otros'), stock_quantity (int default 0), min_stock_level (int default 5), unit_cost (numeric default 0), location (text nullable), created_at, updated_at.

**`maintenance_parts`**: id (UUID PK), maintenance_log_id (UUID FK → maintenance_logs), part_id (UUID FK → parts_inventory), quantity_used (int NOT NULL), cost_at_time (numeric NOT NULL), created_at.

**RLS policies**:
- SELECT: admin, administrativo, mechanic, dispatcher, auditor
- INSERT/UPDATE/DELETE: admin, administrativo, mechanic (operaciones)

Trigger para reducir `stock_quantity` automáticamente al insertar en `maintenance_parts`.

### 2. `src/hooks/usePartsInventory.ts`

Hook con React Query siguiendo el patrón existente (useForklifts):
- `usePartsInventory()` — lista todas las partes ordenadas por nombre
- `useCreatePart()` — insert + invalidate
- `useUpdatePart()` — update by id + invalidate
- `useDeletePart()` — delete by id + invalidate
- `useMaintenanceParts(maintenanceLogId)` — partes usadas en una orden
- `useAddMaintenancePart()` — insert en junction table + invalidate

### 3. `src/lib/changelog.ts` — v3.17.7

