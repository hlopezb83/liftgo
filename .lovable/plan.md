# Plan: Corrección de matriz de roles RLS (fix_role_matrix_rls)

## Hallazgos de validación (bug reales confirmados)

Los 4 casos del diff son **bugs reales**: políticas `FOR ALL` que dan CRUD completo a roles restringidos (`dispatcher`, `mechanic`) sobre tablas de dominio financiero/auditoría. Estado actual en BD:

| # | Tabla | Política problemática | Rol | Concede | ¿Bug real? |
|---|-------|----------------------|-----|---------|-----------|
| A1 | `credit_notes` | "Dispatchers full access credit_notes" | dispatcher | FOR ALL (CRUD) | Sí — dispatchers no deben mutar notas de crédito |
| A2 | `quotes` | "Dispatchers full access quotes" | dispatcher | FOR ALL (CRUD) | Sí — las cotizaciones las maneja `ventas`/`admin` |
| A3 | `status_logs` | "Mechanics full access status_logs" | mechanic | FOR ALL (CRUD) | Sí — el log es append-only vía RPC |
| A4 | `collection_notes` | "Dispatchers full access collection_notes" | dispatcher | FOR ALL (CRUD) | Sí — dominio de cobranza/finanzas |

Roles existentes en el enum `app_role`: admin, dispatcher, mechanic, customer, administrativo, auditor, ventas (todos válidos).

## Problemas detectados en el diff (corregir antes de aplicar)

1. **CRÍTICO — A3 usa tabla inexistente.** El diff referencia `public.forklift_status_logs`, que **no existe** en el esquema (la tabla real es `public.status_logs`). Ejecutar el diff tal cual fallaría: el `DROP POLICY IF EXISTS` es no-op, pero el `CREATE POLICY ... ON public.forklift_status_logs` aborta con `relation does not exist`.

2. **Nombre de política engañoso en A3.** El diff la llama "Mechanics insert read status_logs" pero concede solo `FOR SELECT`. Renombrar a "Mechanics read status_logs".

3. **Regla permanente #3 (SQL).** El diff usa `auth.uid()` directo. Las reglas del proyecto exigen `(select auth.uid())` en todas las policies. Aplicar en las 4 nuevas.

## Verificación de seguridad del remedio (read-only)

- **status_logs (mecánicos):** los cambios de estado de flota se hacen por la RPC `change_forklift_status` (SECURITY DEFINER, bypassa RLS), no por inserts directos de mecánicos. El único insert directo a `status_logs` está en `useCreateForklift` (operación de admin, que conserva `Admins full access status_logs`). → Restrict mechanic a read-only es **seguro**, no rompe el flujo de mecánicos.
- **quotes/credit_notes/collection_notes (dispatchers):** no hay policies INSERT dedicadas para dispatcher en estas tablas; el CRUD venía de la policy `FOR ALL`. Pasar a `FOR SELECT` solo elimina escrituras que el rol no debería tener. Otros roles (`ventas`, `administrativo`, `admin`) conservan sus accesos.

## Migración a aplicar

`supabase/migrations/20260814000000_fix_role_matrix_rls.sql` — corregida:

```sql
-- A1. Restringir notas de crédito para dispatchers (solo lectura)
DROP POLICY IF EXISTS "Dispatchers full access credit_notes" ON public.credit_notes;
CREATE POLICY "Dispatchers read credit_notes" ON public.credit_notes
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));

-- A2. Restringir quotes para dispatchers (solo lectura)
DROP POLICY IF EXISTS "Dispatchers full access quotes" ON public.quotes;
CREATE POLICY "Dispatchers read quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));

-- A3. Evitar mutación del log de flota por mecánicos (solo lectura)
-- CORRECCIÓN: tabla real es status_logs (el diff original decía forklift_status_logs, inexistente)
DROP POLICY IF EXISTS "Mechanics full access status_logs" ON public.status_logs;
CREATE POLICY "Mechanics read status_logs" ON public.status_logs
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'mechanic'::app_role));

-- A4. Restringir collection_notes para dispatchers (solo lectura)
DROP POLICY IF EXISTS "Dispatchers full access collection_notes" ON public.collection_notes;
CREATE POLICY "Dispatchers read collection_notes" ON public.collection_notes
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));
```

## Endurecimiento adicional (opcional, fuera del diff original)

Las 4 tablas tienen `rls_enabled=true` pero `force_rls=false` (el owner `postgres` bypassa RLS). Como hardening, se puede añadir `ALTER TABLE ... FORCE ROW LEVEL SECURITY` en las 4. **Decisión:** incluirlo en la misma migración por ser tablas financieras/auditoría sensibles, conforme a la regla #7 del proyecto.

## Pasos

1. Aplicar la migración corregida vía herramienta `supabase--migration` (con FORCE RLS incluido).
2. Verificar con `supabase--read_query` que las 4 policies `FOR ALL` fueron reemplazadas por `FOR SELECT`.
3. Verificar `supabase--linter` sin regresiones.
4. Actualizar changelog (v7.320.4, patch) y memoria de seguridad.
