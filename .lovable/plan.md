

# Mejorar eliminacion en Bitacora: Opcion de revertir acciones

## Resumen

Cuando el admin hace clic en el icono de eliminar en la bitacora, en lugar del dialogo actual de confirmacion simple, se mostrara un dialogo con **dos opciones**:

1. **Solo borrar el registro de bitacora** (comportamiento actual)
2. **Revertir la accion y borrar el registro** — deshace el cambio original en la base de datos

---

## Logica de reversion por tipo de accion

| Accion original | Que hace "Revertir" |
|----------------|---------------------|
| INSERT (Creacion) | Elimina el registro creado de la tabla original |
| UPDATE (Actualizacion) | Restaura los valores anteriores (`old_data`) en el registro |
| DELETE (Eliminacion) | Re-inserta el registro eliminado usando `old_data` |

---

## Cambios

### 1. Crear funcion RPC en la base de datos: `revert_audit_log`

Una funcion PostgreSQL que recibe el `audit_log_id`, lee la accion, tabla y datos, y ejecuta la reversion de forma atomica:

- Si `action = 'INSERT'`: ejecuta `DELETE FROM <table> WHERE id = record_id`
- Si `action = 'UPDATE'`: ejecuta `UPDATE <table> SET ... WHERE id = record_id` usando `old_data`
- Si `action = 'DELETE'`: ejecuta `INSERT INTO <table> SELECT * FROM jsonb_populate_record(...)` usando `old_data`
- Al final, elimina el registro de `audit_logs`
- Validacion: solo tablas permitidas (whitelist de las 11 tablas auditadas)
- Restriccion: solo admins pueden ejecutarla (SECURITY DEFINER + verificacion de rol)

### 2. Modificar `src/hooks/useAuditLogs.ts`

- Agregar nueva mutacion `useRevertAuditLog` que llama a `supabase.rpc('revert_audit_log', { p_audit_log_id: id })`
- Invalida queries relevantes al completar (audit_logs + la tabla afectada)

### 3. Modificar `src/pages/AuditTrailPage.tsx`

- Reemplazar el `AlertDialog` actual por un dialogo con dos botones de accion:
  - "Solo borrar registro" — llama a `deleteAuditLog` (comportamiento actual)
  - "Revertir accion y borrar" — llama a `revertAuditLog` (nueva mutacion)
- Mostrar informacion contextual en el dialogo: que tabla, que accion, y que pasara si se revierte
- Para acciones DELETE donde no hay `old_data`, deshabilitar la opcion de revertir
- Texto de advertencia claro para la opcion de revertir: "Esto deshara el cambio original en la base de datos"

### 4. Actualizar `src/lib/changelog.ts`

- Agregar entrada describiendo la mejora

---

## Detalle tecnico

### Funcion RPC `revert_audit_log`

```text
Parametros: p_audit_log_id uuid
Retorna: void
Seguridad: SECURITY DEFINER, verifica has_role(auth.uid(), 'admin')

Logica:
1. SELECT * FROM audit_logs WHERE id = p_audit_log_id
2. Validar que table_name esta en whitelist
3. CASE action:
   - 'INSERT': DELETE FROM {table_name} WHERE id = record_id
   - 'UPDATE': UPDATE {table_name} SET cols = old_data WHERE id = record_id
   - 'DELETE': INSERT INTO {table_name} SELECT * FROM jsonb_populate_record(null::{table_name}, old_data)
4. DELETE FROM audit_logs WHERE id = p_audit_log_id
```

La funcion usa SQL dinamico (`EXECUTE`) con la tabla validada contra una whitelist para prevenir inyeccion SQL.

### UI del dialogo mejorado

El dialogo mostrara:
- Titulo: "Eliminar registro de bitacora"
- Descripcion del registro (tabla, accion, fecha)
- Dos botones:
  - Boton gris/outline: "Solo borrar de bitacora"
  - Boton rojo/destructive: "Revertir accion original" (con icono de advertencia)
- Nota: al revertir un INSERT, se advierte que el registro sera eliminado; al revertir un UPDATE, se restauraran los valores anteriores; al revertir un DELETE, se re-creara el registro

---

## Archivos a crear/modificar

1. **Migracion SQL** — crear funcion `revert_audit_log`
2. **Modificar** `src/hooks/useAuditLogs.ts` — agregar `useRevertAuditLog`
3. **Modificar** `src/pages/AuditTrailPage.tsx` — dialogo con dos opciones
4. **Modificar** `src/lib/changelog.ts` — nueva entrada

