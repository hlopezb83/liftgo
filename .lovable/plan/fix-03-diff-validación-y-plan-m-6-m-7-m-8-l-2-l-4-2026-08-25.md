# fix-03.diff — Validación y plan (M-6, M-7, M-8, L-2, L-4)

Revisé los cinco parches contra la base de datos y el código actual. Dos ya están aplicados, tres son bugs reales, y uno del diff traería un efecto secundario nuevo que hay que corregir antes de aplicarlo.

## Estado verificado

| Fix | Veredicto | Evidencia |
|---|---|---|
| M-6 — saldo con notas de crédito + `overdue` al resetear | **Ya aplicado** | La definición vigente de `sync_invoice_status_from_payments` ya resta `credited` de NCs timbradas y ya usa `today_mty()` para caer en `overdue`. El parche es idéntico. |
| M-7 — entrega `completed` terminal + unidad a `rented` | **Bug real** | En `deliveries` sólo existen `audit_deliveries`, `trg_delivery_booking_integrity`, `trg_delivery_not_in_past`, `trg_guard_delivery_delete`, `trg_set_delivery_number`. No hay guardia de `completed` ni efecto sobre `forklifts`. |
| M-8 — cotización a `converted` | **Bug real** | `convert_quote_to_bookings` no toca el status; la cotización queda en `accepted`. |
| L-2 — `status_logs` fantasma al borrar cotización | **Bug real** | La función vigente inserta el log fuera de cualquier chequeo de `ROW_COUNT`. |
| L-4 — fecha de pago a proveedor | **Parcial** | El default del parámetro ya es `today_mty()`; falta sólo el `COALESCE` del `INSERT` para el caso en que llegue `NULL` explícito. |

## Corrección necesaria al parche M-7

El trigger de efectos del diff dispara con **cualquier** entrega que pase a `completed`. Hoy la tabla tiene `type` `delivery` y `pickup`: al completar una recolección la unidad quedaría marcada como **rentada**, justo al revés. Además `DeliveryFormDialog` puede crear una entrega ya `completed` en el INSERT, y el trigger propuesto es sólo `AFTER UPDATE`, así que ese camino no marcaría la unidad.

Ajustes al aplicarlo:
- Condicionar el efecto a `NEW.type = 'delivery'`.
- Disparar también `AFTER INSERT` cuando nace `completed`.
- Mantener la guardia de terminalidad sólo en UPDATE (con excepción `service_role`).

## Plan

### Fase 1 — Migraciones SQL
1. `m7_deliveries_completed_triggers` — guardia de `completed` terminal + efectos al completar (con las correcciones de arriba: sólo `type = 'delivery'`, INSERT y UPDATE, bypass `app.forklift_rpc`, log en `status_logs` sólo si el UPDATE afectó filas).
2. `m8_convert_quote_marks_converted` — amplía `quotes_status_dominio` con `converted`, agrega `accepted -> converted` a la whitelist de `validate_transition` (resto de la función idéntico al vigente) y cierra `convert_quote_to_bookings` marcando la cotización.
3. `l2_delete_quote_status_log_rowcount` — log sólo con `GET DIAGNOSTICS ... ROW_COUNT > 0`.
4. `l4_register_supplier_payment_coalesce` — `COALESCE(p_payment_date, public.today_mty())` en el INSERT.

Todas conservan `SECURITY DEFINER` + `SET search_path = public` + guards de rol existentes, conforme a las reglas permanentes de migraciones. M-6 no se re-aplica.

### Fase 2 — Frontend (lo que el diff no trae)
El nuevo estado `converted` rompe etiquetas y filtros si no se acompaña:
- `src/features/quotes/constants.ts` y `src/features/portal/lib/quoteStatus.ts`: etiqueta "Convertida" (hoy el portal mostraría `—`).
- `src/lib/rules/quotes.ts`: `canConvertQuote` debe considerar `converted` como no convertible; `isQuoteAccepted` debe seguir siendo verdadero para una cotización ya convertida (se apoya en `accepted_at`).
- Filtros y badges de `QuotesPage`/`quotesColumns`/`QuoteHeaderBadges`/`PortalQuotes`: incluir el nuevo estado en las opciones y en el mapa de variantes.
- `useQuoteConversionActions.ts`: invalidar la cotización tras convertir para que la UI refleje el nuevo estado.
- Detalle de entrega: mensaje claro cuando el backend rechace reabrir una entrega completada (catálogo de errores existente).

### Fase 3 — Verificación
- Smoke SQL nuevo en `supabase/tests/` (entrega completada → unidad rentada y `status_log`; recolección completada NO marca rentada; reapertura bloqueada; cotización convertida; borrado de cotización sin log fantasma).
- Vitest de las reglas y componentes de cotizaciones + `bun run build` + suite completa.
- Changelog: entrada **minor** (v7.336.0 si aún libre, si no la siguiente) con su archivo de detalle.

## Detalle técnico
- El dominio `quotes_status_dominio` se recrea `NOT VALID` y luego se valida, como en el diff: no hay filas fuera del nuevo dominio porque sólo se agrega un valor.
- `validate_transition` se recrea completa; conservo íntegras las reglas de `supplier_bills` (Fix 4.3), `forklifts` (Fix 4.4), el bypass `app.payment_sync` y el de `app.sat_flow`.
- El efecto sobre `forklifts` usa `set_config('app.forklift_rpc','on',true)` para pasar la máquina de estados, mismo patrón ya usado para pagos.
