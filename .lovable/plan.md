

## Plan: Mantenimiento Recurrente con Póliza de Proveedor Externo (v3.17.10)

### Resumen
Crear una tabla de configuración de pólizas de mantenimiento recurrente y una Edge Function con cron job que genere automáticamente registros de mantenimiento mensual para cada montacargas con status `rented`.

### Cambios

**1. Migración DB** — Nueva tabla `maintenance_policies`
```sql
CREATE TABLE public.maintenance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forklift_id uuid NOT NULL REFERENCES forklifts(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  monthly_cost numeric NOT NULL DEFAULT 0,
  service_type text NOT NULL DEFAULT 'Póliza de Mantenimiento',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  last_generated_month text, -- 'YYYY-MM' para rastrear el último mes generado
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(forklift_id)
);
```
- RLS: admin/administrativo full access, mechanic/auditor/dispatcher read
- Trigger `update_updated_at_column` para updated_at

**2. `src/hooks/useMaintenancePolicies.ts`** — Nuevo hook CRUD
- `useMaintenancePolicies()` — lista todas las pólizas con join a forklifts.name
- `useCreateMaintenancePolicy()`, `useUpdateMaintenancePolicy()`, `useDeleteMaintenancePolicy()`

**3. Nueva pestaña en `src/pages/OperationsSetupPage.tsx`** — "Pólizas de Mantenimiento"
- Tabla con columnas: Montacargas, Proveedor, Costo Mensual, Tipo de Servicio, Estado (activo/inactivo)
- Dialog para crear/editar póliza: selector de montacargas (filtrado a status `rented`), nombre del proveedor, costo mensual, tipo de servicio, descripción
- Toggle para activar/desactivar

**4. Edge Function `supabase/functions/generate-recurring-maintenance/index.ts`**
- Consulta `maintenance_policies` activas donde el montacargas tiene status `rented`
- Para cada póliza donde `last_generated_month < mes actual` (o es null):
  - Inserta `maintenance_log` con: forklift_id, service_type, cost, performed_by = provider_name, performed_at = primer día del mes actual, work_status = 'completed', next_service_date = primer día del mes siguiente
  - Actualiza `last_generated_month` al mes actual
- Responde con resumen de registros generados

**5. Cron job** — Ejecutar la Edge Function el día 1 de cada mes
- `pg_cron` schedule: `0 6 1 * *` (6am del día 1)

**6. Botón manual en MaintenancePage** — "Generar Mantenimiento Recurrente"
- Botón que invoca la Edge Function manualmente para pruebas/catch-up
- Solo visible para admin/administrativo

**7. `src/lib/constants.ts`** — Agregar "Póliza de Mantenimiento" a `SERVICE_TYPES`

**8. `src/lib/changelog.ts`** — v3.17.10

### Diagrama de flujo
```text
Día 1 del mes (cron) o botón manual
  └─► Edge Function: generate-recurring-maintenance
        ├─► SELECT maintenance_policies WHERE is_active = true
        │     JOIN forklifts WHERE status = 'rented'
        │     WHERE last_generated_month < current month
        ├─► Para cada póliza:
        │     INSERT maintenance_logs (auto-completado)
        │     UPDATE maintenance_policies.last_generated_month
        └─► Respuesta: { generated: N, skipped: M }
```

### Notas técnicas
- La tabla tiene UNIQUE(forklift_id) — una póliza por montacargas
- `last_generated_month` evita duplicados si se ejecuta múltiples veces
- La Edge Function usa service role para bypass de RLS
- El cron se configurará via SQL insert (no migración)

