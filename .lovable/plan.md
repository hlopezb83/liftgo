
## Problema

Al borrar una cotización de venta con equipos asignados (`quote_assigned_forklifts`), los montacargas quedan con `status = 'sold'` huérfano y desaparecen del inventario disponible. Hoy `useDeleteQuote` solo hace `DELETE FROM quotes` sin tocar asignaciones ni estatus.

## Solución propuesta

Al eliminar una cotización, liberar automáticamente los equipos asignados (revertir a `available` + log) de forma atómica vía RPC. También arreglar los equipos ya afectados.

### 1. Migración: RPC `delete_quote_with_unassign`

Función `SECURITY DEFINER` con `SET search_path = public` que en una sola transacción:
1. Lee asignaciones de la cotización (`quote_assigned_forklifts`).
2. Para cada `forklift_id`: `UPDATE forklifts SET status='available'` (solo si está `sold`) e inserta en `status_logs` con nota *"Liberado por eliminación de cotización {quote_number}"*.
3. Borra `quote_assigned_forklifts` de esa cotización.
4. Borra la `quote`.

Permisos: ejecutable por roles que ya pueden borrar cotizaciones (admin, ventas, etc.) — se valida con `has_role`.

### 2. Frontend — `useDeleteQuote` (`src/features/quotes/hooks/quotes/useQuotes.ts`)

Reemplazar el `supabase.from("quotes").delete()` por `callRpc("delete_quote_with_unassign", { p_quote_id: id })`. Invalidar también `["forklifts"]`, `["forklift-options"]`, `["quote_assigned_forklifts"]` y `["status_logs"]`.

### 3. Backfill puntual

Script SQL (insert tool) para los equipos que quedaron `sold` sin asignación viva: detectar `forklifts.status='sold'` que no aparezcan en ninguna `quote_assigned_forklifts` ni en ventas reales (invoice de venta), y regresarlos a `available` con log *"Corrección: cotización eliminada previamente"*. Antes de aplicar, validar con `read_query` la lista candidata para que el usuario confirme.

### 4. Changelog

Patch `6.14.7` en `public/changelog.json` + `public/changelog/v6.14.7.json`.

## Notas técnicas

- No se cambia el flujo de UI (sin diálogo extra). El usuario sigue confirmando con el `AlertDialog` actual.
- La operación es atómica: si falla el unassign, no se borra la cotización.
- No se tocan equipos cuya venta ya fue facturada (status sigue `sold` solo si hay invoice asociada — la heurística del backfill lo respeta).
