# Auditoría v7.91.0–v7.93.0 y arranque de Sprint v7.94.0

## Hallazgos de la auditoría

1. **Tests desactualizados (bloqueante)** — `src/features/inventory/hooks/__tests__/useAddMaintenancePart.test.ts`: los 3 tests que fallan (de 1048) verifican comportamiento removido en v7.93.0 (update manual de `maintenance_logs.cost` y `assertRowsAffected`). Ese trabajo lo hacen ahora los triggers `trg_maintenance_parts_adjust_stock` y `trg_maintenance_parts_recalc_cost`. Tests hay que reescribirlos.
2. **Faltan tests unitarios** para:
  - `applyRatesToBookings` (BL-31): mapping de assignments a payloads y el descarte de tarifas en cero.
  - `expire_stale_quotes()` y el trigger `enforce_signed_contract_lock` (BL-23/27) — cobertura Deno/psql pendiente.
3. **Sin bugs de comportamiento detectados** en Fases 2-4:
  - Migrations aplicadas (triggers activos verificados con `information_schema.triggers`).
  - `generate-recurring-invoices` corregido (duplicado de `end_date` en select limpiado).
  - `useQuoteBookingCreator` con rollback best-effort funcional.
  - Warnings del linter Supabase son preexistentes (extensión en public, funciones SD ya documentadas en `mem://security-memory.md`).

## Fase 0 (patch v7.93.1) — Alinear tests con triggers

Reemplazar `useAddMaintenancePart.test.ts` para reflejar el nuevo contrato:

- Insert simple sin escritura manual en `maintenance_logs`.
- Removido `currentLogCost` del payload persistido.
- Propagación de error del insert (sin fallback al update).
- Nota en el describe explicando que stock y cost los maneja el servidor (triggers).

Agregar test unitario nuevo:

- `src/features/quotes/hooks/quoteDetail/__tests__/applyRatesToBookings.test.ts` — verifica que sólo se actualizan reservas con tarifas > 0 y que devuelve el conteo correcto.

## Fase 1 del Sprint v7.94.0 — Próximos hallazgos

Después de estabilizar tests, arrancar el siguiente lote de la ronda 2 profunda (dominios que todavía no auditamos con lupa):

- **BL-32 completo**: RPC transaccional `convert_quote_to_bookings` que reemplace el rollback best-effort actual (creación atómica de N reservas + escritura de tarifas + update de status de la cotización en una sola transacción, aprovechando `create_booking` inline).
- **Cash flow por método de pago**: validar que `get_dashboard_stats` respete el filtro de método de pago (efectivo vs transferencia) tras los cambios de v7.61.1.
- **Portal de clientes**: revisión de RLS de `customer_payment_intents` tras las nuevas RPCs `approve_/reject_payment_intent`.
- **Programación de `expire_stale_quotes**`: crear cron con `pg_cron` para ejecutar diariamente 00:15 America/Monterrey.

## Detalles técnicos

- Archivos a modificar en Fase 0:
  - `src/features/inventory/hooks/__tests__/useAddMaintenancePart.test.ts` (rewrite)
  - `src/features/quotes/hooks/quoteDetail/__tests__/applyRatesToBookings.test.ts` (nuevo)
- Verificación: `bunx vitest run` debe volver a 1046+ verdes.
- Al finalizar: entrada en `public/changelog.json` y `public/changelog/v7.93.1.json` (patch).

## Preguntas para el usuario

¿Ejecuto Fase 0 y Fase 1 completas en este turno, o sólo Fase 0 (fix de tests) y esperamos revisión antes de arrancar Sprint v7.94.0? ambas