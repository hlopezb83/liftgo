# Cierre de pendientes R5 — Lote 2 y 3

Continuación del trabajo publicado en v7.399.0 (reabrir OT + bloqueo optimista en reservas).

## Lote 2 — Quick wins restantes (Fase 1)

### 1. Cotización convertida que se queda en limbo
Hoy, cuando una cotización se convierte a reservas pasa a "Convertida" y ahí se queda, aunque después se cancelen todas sus reservas. Queda sin poder aceptarse, re-convertirse ni avanzar.

Cambio: cuando se cancela una reserva y ya **no queda ninguna reserva vigente** de esa cotización, la cotización regresa automáticamente a "Aceptada". Si aún hay reservas activas, no se toca. Queda registro del movimiento en la bitácora.

### 2. Bitácora al liberar un daño por cancelación de factura
Cuando se cancela una factura, el daño ligado regresa de "Facturado" a "Reparado" y se le quita la factura, pero eso pasa en silencio: nadie puede explicar después por qué cambió.

Cambio: cada liberación deja una entrada en la bitácora con el motivo ("factura cancelada" o "factura eliminada") y el folio involucrado.

## Lote 3 — Integridad (Fase 2)

### 3. Archivar una OT abierta ya no borra su historial
Al archivar una orden de trabajo que no está cerrada, el sistema **borra físicamente** sus refacciones y su mano de obra. Si luego se restaura, esa información ya no existe.

Cambio: dejar de borrar; el archivado sólo oculta. Las OTs cerradas ya se comportaban así.

### 4. Restaurar OTs y daños archivados
No existe forma de deshacer un archivado desde la app.

Cambio:
- Dos operaciones nuevas de restauración (órdenes de trabajo y daños), sólo para administradores, con las mismas validaciones de estado que el archivado.
- Filtro "Archivados" en los listados de Mantenimiento y Daños, con botón "Restaurar" y confirmación.

### 5. Criterio único de "devolución"
Varias consultas consideran devuelta una unidad sólo porque existe un movimiento de tipo "recolección", sin exigir la inspección de retorno. Eso puede dar por cerradas rentas que no lo están.

Cambio: unificar el criterio en un solo lugar (recolección completada **e** inspección registrada) y usarlo en todas las consultas y reportes que hoy lo calculan por su cuenta.

## Detalles técnicos

- Migraciones nuevas: trigger de rebote `converted → accepted` en cancelación de reservas; inserción en `status_logs` dentro de `release_damage_on_invoice_cancel`; ajuste de `soft_delete_maintenance_log` para no ejecutar `DELETE` sobre `maintenance_parts` / `maintenance_labor`; funciones `restore_maintenance_log` y `restore_damage_record` (`SECURITY DEFINER`, `SET search_path = public`, guard de rol admin, `GRANT EXECUTE` sólo a `authenticated`).
- Todas las migraciones respetan las reglas permanentes: `(select auth.uid())` en policies, sin `FOR ALL ... USING (true)`, y pasan `scripts/lint-migrations.ts`.
- Frontend: hooks `useRestoreMaintenanceLog` / `useRestoreDamageRecord` sobre `callRpc`, filtro de archivados en los listados existentes vía el patrón `useListPage`, sin tocar reglas de negocio.
- Predicado de devolución: helper compartido en `src/lib/rules` + su equivalente SQL, reemplazando los cálculos duplicados.
- Pruebas: unitarias para el predicado de devolución y los hooks de restauración; smoke SQL para el rebote de cotización, la bitácora de daños y la conservación de refacciones al archivar.
- Changelog y versión: una entrada por lote (7.400.0 y 7.401.0).
