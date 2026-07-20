# Auditoría de Ola 2.2 (v7.118.0)

- Vitest 1084/1084 ✅  
- Deno `generate-recurring-invoices`: 13/13 ✅ (bookingEnded 4, index 3, prorate 6)
- RPC `create_recurring_invoice` registrada con firma correcta (15 args) y `SECURITY DEFINER`.
- Manejo de `23505` como idempotencia benigna presente en la Edge Function.
- Advisory locks por `booking_id` previenen doble facturación concurrente.

**Sin bugs detectados.** Gap menor (aceptable): no hay integration test end-to-end contra la RPC real (requeriría seeding con service-role). Los unit tests de prorrateo + smoke tests de auth cubren el contrato crítico.

Todo verde → procedo a la siguiente ola.

# Ola 2.3 — Resiliencia CFDI (EC-A1 + EC-A2)

Del reporte de auditoría integral, dos hallazgos 🟠 alto quedan en la capa fiscal después de Sprint 1:

## EC-A1 — Consumidor de `cfdi_retry_queue`

Hoy los errores transitorios de Facturapi se encolan en `cfdi_retry_queue` pero **nadie los procesa**. Las facturas quedan huérfanas hasta intervención manual.

**Solución:**
1. Nueva Edge Function `process-cfdi-retry-queue` (cron-friendly):
   - Selecciona filas `status='pending'` con `next_retry_at <= now()` y `attempts < max_attempts` (5).
   - Advisory lock por `invoice_id` para evitar procesamiento paralelo.
   - Reintenta llamando a `stamp-cfdi` internamente.
   - Éxito → `status='completed'`. Fallo → `attempts++`, backoff exponencial (2^n min, tope 60min), `status='failed'` si excede.
2. Registrar el cron en `supabase/config.toml` (cada 5 min).
3. Tests Deno: éxito, backoff, límite de intentos, idempotencia con `23505`.

## EC-A2 — `stamping` huérfanos + timeout SDK

Si `stamp-cfdi` falla después de que Facturapi emitió el CFDI pero antes del UPDATE local, la factura queda en `status='stamping'` con el UUID ya facturado en el SAT → duplicado al reintentar.

**Solución:**
1. RPC `reconcile_stamping_invoice(p_invoice_id, p_facturapi_id, p_uuid, p_xml_url, p_pdf_url)` (`SECURITY DEFINER`):
   - Verifica que la factura sigue en `stamping`.
   - Setea `status='stamped'` + datos CFDI.
   - Idempotente: si ya está `stamped` con el mismo UUID, retorna éxito silencioso; si UUID distinto, lanza excepción (conflicto real).
2. En `stamp-cfdi/index.ts`:
   - Envolver la llamada a Facturapi con `AbortController` (timeout 30s).
   - Tras respuesta exitosa del SDK, usar la nueva RPC en lugar del UPDATE directo → recuperable.
3. Nueva Edge Function `reconcile-stamping-invoices` (cron cada 15 min):
   - Busca facturas `status='stamping'` con `updated_at < now() - interval '10 min'`.
   - Consulta Facturapi por `folio_number` o `series+folio` para saber si el CFDI existe.
   - Si existe → llama a `reconcile_stamping_invoice`. Si no → revierte a `draft`.
4. Tests Deno: timeout, conciliación exitosa, conflicto de UUID, reversión a draft.

## Alcance técnico

### Archivos nuevos
- `supabase/migrations/<ts>_cfdi_resilience.sql` — RPC `reconcile_stamping_invoice`.
- `supabase/functions/process-cfdi-retry-queue/index.ts` + `_test.ts`.
- `supabase/functions/reconcile-stamping-invoices/index.ts` + `_test.ts`.

### Archivos modificados
- `supabase/functions/stamp-cfdi/index.ts` — AbortController + RPC reconcile.
- `supabase/config.toml` — dos nuevos schedules.
- `public/changelog.json` + `public/changelog/v7.119.0.json`.

### Fuera de alcance
- BL-B (facturación recurrente) — completo en 2.2.
- UI del portal / reportes — Sprint 3.

## Criterios de aceptación
- Vitest 1084/1084 verde.
- Deno tests nuevos + existentes verdes.
- Linter Supabase sin nuevas advertencias.
- Manual: forzar `INSERT INTO cfdi_retry_queue (...)` y verificar que el cron procesa la fila.
