# Validación y cierre de pendientes — Ronda 5

## Verificación previa (hecha contra el sistema real, no contra el reporte)

- **Paso 0 (migración `20260831054419` "rota"): FALSO POSITIVO.** La tabla de migraciones de la base la registra como aplicada, junto con las 13 que el reporte da por bloqueadas (`054601` … `194111`) y las posteriores (`203519`, `203627`, `211732`). No hay despliegue bloqueado. Sí es cierto que la técnica string-replace es frágil; se documenta como abandonada, sin tocar archivos ya aplicados.
- **A5-07 (Gantt con buffer): YA CORREGIDO** en v7.398.2 (`useGanttSegments` dibuja `[fecha − buffer, fecha + buffer]` leyendo `maintenance_buffer_days`).
- **A3B-05 (borrado de cotizaciones en limbo): YA CORREGIDO** en v7.398.2 (`guard_quote_delete` ignora reservas canceladas). Queda pendiente solo la transición `converted → accepted`.
- **Test TZ `supplierBillDueDate`: YA CORREGIDO** (`TZ: "UTC"` en `vitest.config.ts` + anclaje a mediodía).
- **A2-7-MRR:** no existe ninguna vista `v_mrr_prev` en la base y `get_dashboard_stats` ya no calcula `mrr_prev`. El pendiente real es distinto al descrito: revisar de dónde toma hoy el comparativo mensual el tablero antes de escribir SQL.
- **Confirmados como pendientes reales:** no existen `restore_maintenance_log` / `restore_damage_record`; `soft_delete_maintenance_log` sigue borrando físicamente refacciones y mano de obra de OT abiertas; `sync_forklift_rental_status`, `cancel_booking`, `create_booking`, `get_available_forklifts` y `v_booking_occupancy` aún aceptan `deliveries.type='return'` como devolución; `reopen_work_order` existe sin botón en la app; ninguna pantalla escribe `operating_expenses.supplier_bill_id`.

## Qué se va a hacer

### Fase 1 — Quick wins (bajo riesgo)
1. **Botón "Reabrir OT"** en el detalle de orden de trabajo: hook React Query hacia la RPC `reopen_work_order`, visible solo para admin y OT completada, con confirmación.
2. **Bitácora al liberar daños:** `release_damage_on_invoice_cancel` registra el cambio `invoiced → repaired` en `status_logs` (CREATE OR REPLACE completo).
3. **Bloqueo optimista en reservas:** pasar `expectedVersion` en las mutaciones de estado de reserva (la mutación ya lo soporta).
4. **Cotización en limbo, segunda mitad:** permitir volver de `converted` a `accepted` cuando todas las reservas quedaron canceladas, para poder reconvertirla.
5. Actualizar el comentario obsoleto de `useBookingExtensions.ts` ("buffer de 3 días" → configurable).

### Fase 2 — Integridad de datos (media)
6. **Archivar nunca destruye historial:** `soft_delete_maintenance_log` deja de borrar `maintenance_parts` / `maintenance_labor` de OT abiertas.
7. **Restauración real:** nuevas RPCs `restore_maintenance_log` y `restore_damage_record` (admin-only, `FOR UPDATE`, `status_logs`, GRANT explícitos) y botón "Restaurar" en las vistas de archivados, incluyendo los restores ya existentes de clientes, proveedores y unidades que hoy no tienen UI.
8. **Devolución = inspección de retorno:** unificar el criterio en los cinco consumidores (`sync_forklift_rental_status`, `cancel_booking`, `create_booking`, `get_available_forklifts`, `v_booking_occupancy`) con `CREATE OR REPLACE` completos, y CHECK `deliveries.type IN ('delivery','pickup')` previa consulta de datos legacy.

### Fase 3 — Fiscal y financiero
9. **Régimen fiscal desde la CSF:** normalizar a los 3 dígitos del catálogo al parsear, en clientes, proveedores y pestaña fiscal, más guarda de catálogo en el servidor antes de timbrar (fail-fast en vez de rechazo del PAC).
10. **Contrato/pagaré sin monto:** completar el snapshot firmado con plantilla y `acquisition_cost`, y alinear `brand` vs `manufacturer` en el PDF.
11. **Comparativo de MRR:** localizar la fuente real del MRR del mes anterior y aplicarle el mismo criterio anti-paridad 1:1 que ya tiene `get_mrr_detail` (divisa sin tipo de cambio se excluye y se avisa).

### Fase 4 — Estructurales (se planean aparte al cerrar las anteriores)
12. **B5-01** tarifa histórica en facturación recurrente atrasada (snapshot por periodo o bloqueo fail-closed).
13. **A2-3** cancelación de lote de pagos a proveedor (RPC + trigger + UI).
14. **A2-9** vincular gastos operativos a facturas de proveedor desde el formulario.

## Notas técnicas

- Toda migración usa `CREATE OR REPLACE` completo; prohibido `pg_get_functiondef` + `replace()`.
- Reglas SQL vigentes: RLS + policies + GRANT explícitos, `(select auth.uid())`, `SET search_path = public` y guardas de rol en `SECURITY DEFINER`, bypass `app.e2e_seed` en guards.
- Pruebas vitest junto a cada cambio de hook y smoke SQL por migración; dinero en centavos, fechas con `nowMty()` / `today_mty()`.
- Cada fase cierra con entrada de changelog y bump de versión.
