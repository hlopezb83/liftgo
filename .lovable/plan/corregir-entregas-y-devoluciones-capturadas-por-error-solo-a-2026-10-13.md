# Corregir entregas y devoluciones capturadas por error (solo administradores)

## Qué podrás hacer
1. **Entrega completada → "Corregir fecha"**: botón nuevo en el detalle de la entrega (p. ej. ENT-0035). Pide fecha/hora correcta y un motivo obligatorio. Solo cambia la fecha de entrega registrada; no toca la reserva, la factura ni el montacargas.
2. **Entrega completada → "Anular entrega"**: para entregas que nunca ocurrieron. Pide motivo, la marca como cancelada (no se borra, queda en el historial) y, si el montacargas quedó "rentado" solo por esa entrega y no hay otra activa, lo regresa a "disponible".
3. **Devolución → "Anular devolución"**: botón en el detalle de la devolución (p. ej. DEV-0009). Pide motivo y:
   - marca la devolución como anulada (queda visible con etiqueta "Anulada", no se borra);
   - reabre la reserva (quita el estado "devuelta"/"completada" y la regresa a "activa");
   - regresa el montacargas a "rentado" si estaba "disponible";
   - se bloquea si de esa devolución ya salió un daño facturado o una factura de cargo por retraso.
4. Cada corrección queda en la bitácora de auditoría con quién, cuándo y por qué.

Con esto podrás hacer tú mismo en el sistema: fecha de ENT-0035 al 17 de julio, anular DEV-0009 y dejar RSV-0047 activa con el montacargas rentado.

## Detalles técnicos
- Migración nueva (Drizzle) con tres RPC `SECURITY DEFINER`, guard `has_role(admin)` + `current_internal_organization_id()` + `is_internal_member`, `search_path` fijo, `REVOKE` a `anon`/`PUBLIC`, `GRANT EXECUTE` a `authenticated`:
  - `correct_delivery_completed_at(p_delivery_id, p_completed_at, p_reason)`
  - `void_completed_delivery(p_delivery_id, p_reason)`
  - `void_return_inspection(p_inspection_id, p_reason)` — columnas nuevas nulas `voided_at`, `voided_by`, `void_reason` en `return_inspections`; bloquea con P0001 + código de negocio si hay `damage_records` facturados.
- Se conserva `guard_delivery_delete` (no se habilita borrado físico; se anula).
- Vistas de "devoluciones" y `useReturnableBookings` excluyen inspecciones anuladas.
- Frontend: hooks en `useDeliveries.ts` / `useReturnInspections.ts`, diálogos con motivo, botones bajo `AdminRouteGuard`/rol admin, nuevos códigos en `businessBlocks.data.ts`.
- Pruebas puntuales: Vitest de los diálogos/hooks y smoke SQL de solo lectura de catálogo (sin escrituras en producción). Changelogs 8.44.0 (minor).
