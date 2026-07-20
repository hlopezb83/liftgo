## Auditoría Ola 2.3 (v7.119.0/1)

**Estado: verde.** Revisé lo entregado:

- `process-cfdi-retry-queue` y `reconcile-stamping-invoices` existen con `index_test.ts` (22/22 Deno pasando según changelog).
- Hardening de `stamp-cfdi` (timeout 30s, persistencia temprana, bypass `service_role`) presente.
- v7.119.1: fingerprint puntual de gitleaks agregado a `.gitleaksignore` — cambio mínimo, sin código productivo, no requiere tests.

Sin bugs pendientes ni tests faltantes en Ola 2.3.

## Siguiente fase: Sprint 2 · Ola 2.4 — Disponibilidad de flota e invariantes de reserva

Del roadmap del audit, Sprint 2 restante. Verifiqué en repo:

- BL-A1 abierto: `useExtendBookingPreview.ts:22` sigue con `computeTotals(items, 21)`.
- BL-A2 **ya resuelto** en migración `20260719055254` (`EXCLUDE USING gist ... WHERE status NOT IN cancelled/completed`). Se omite.
- BL-A3 abierto: `create_booking` exige `status='available'` y flip inmediato a `rented`, contradiciendo el modelo de reservas futuras que asume `get_available_forklifts`.
- BL-M2 abierto: `convert_quote_to_bookings` toma tarifas del payload cliente.

### Alcance

1. **BL-A1 — IVA correcto en preview de extensión**
   - `useExtendBookingPreview.ts`: reemplazar `21` por la tasa del dominio (default 16%; leer de `useCompanySettings` si expone `default_vat_rate`, si no constante `DEFAULT_VAT_RATE` desde `lib/tax`).
   - Test unitario: extensión con equipo estándar → total esperado usa 16%.

2. **BL-A3 — Disponibilidad basada en fechas, no en flag `status`**
   - RPC `create_booking`: cambiar precondición de `forklift.status='available'` a "no existe otra reserva activa que traslape con `[start_date, end_date]`" (misma semántica que la exclusion constraint). Mantener bloqueo con `FOR UPDATE` sobre `forklifts`.
   - Ya **no** setear `forklifts.status='rented'` al crear una reserva futura. El status del montacargas queda como estado operativo (available/rented/maintenance/out_of_service) y se deriva/actualiza en eventos de entrega/devolución (respetando la memoria `forklift-status-persistence`).
   - Ajustar/agregar disparador o RPC `refresh_forklift_status(forklift_id)` invocado desde entregas/devoluciones/mantenimiento para mantener consistencia con "hay reserva activa hoy" (patrón ya usado por `get_dashboard_stats`).
   - Tests: (a) reservar unidad para próxima semana estando rentada hoy → OK; (b) traslape → error controlado; (c) `forklifts.status` no cambia por sola creación de reserva futura.

3. **BL-M2 — Tarifas server-side al convertir cotización**
   - RPC `convert_quote_to_bookings`: leer `monthly_rate/daily_rate/hourly_rate` desde `quotes`/`quote_items` (fuente de verdad) en lugar del JSONB payload; ignorar tarifas del cliente. Loguear si el payload difiere.
   - Test: llamada con payload manipulado → factura/booking usa tarifa persistida.

4. **Changelog**
   - `public/changelog.json` + `public/changelog/v7.120.0.json` (minor, resume BL-A1/BL-A3/BL-M2).

### Verificación

- `bun test` (Vitest) — se espera 1085+/1085+ verdes.
- `deno test` en `supabase/functions` — sin regresiones.
- Smoke Playwright opcional del flujo Cotización → Reserva → Extensión ya cubierto por E2E existentes.

### Fuera de alcance (siguiente ola)

BL-M3 (trigger anti sobre-crédito NC), BL-M4 (soft-delete flota), BL-M6 (daño sin costo), EC-M4 (optimistic locking) — se agrupan en Ola 2.5.