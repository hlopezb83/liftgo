# Lote urgente — cierre de fixes rotos post-auditoría

La verificación de los 4 subagentes marca **2 críticos nuevos introducidos por los propios fixes** y 3 altos con exposición fiscal (doble timbrado ante SAT, facturas timbradas sin XML, `stamp_variance` declarado pero inexistente). Este lote los cierra. El resto de hallazgos abiertos (26 pendientes de la auditoría integral) se atacan en olas siguientes.

## Alcance

Solo los 5 puntos "Urgente" del reporte de verificación (§5). Nada de UX/Mejoras/Pulido en este lote — se agendan aparte.

---

## 1. NC-1 · `cfdi_retry_queue`: consumer viola su propio CHECK

**Problema confirmado**: la tabla acepta `status IN ('pending','processing','succeeded','exhausted')` pero `process-cfdi-retry-queue/index.ts` escribe `"completed"` (L92, 126, 134) y `"failed"` (L143, 163). Postgres rechaza el UPDATE, el consumer nunca chequea el error → filas quedan `pending` para siempre. Éxitos se reprocesan infinito, fallos nunca agotan reintentos.

**Fix**
- Alinear el consumer a los valores del CHECK: `completed → succeeded`, `failed (terminal) → exhausted`, `failed (retry) → pending` con `attempts++` y `next_retry_at` en el futuro.
- Introducir helper `markQueueRow(supabase, id, patch)` que revise `{ error }` de cada `.update()` y logue con `console.error` si falla.
- Añadir transición a `processing` al hacer claim (evita doble consumo concurrente; hoy el "advisory lock" está muerto).
- Corregir `index_test.ts` para asertar los valores nuevos.

## 2. NC-2 · Funciones cron sin cron ni auth

**Problema**: `process-cfdi-retry-queue` y `reconcile-stamping-invoices` tienen `verify_jwt = false` y cero validación interna. Comentario dice "corre cada 5 min" pero no hay schedule. Cualquier anónimo las dispara → DoS de cuota Facturapi.

**Fix**
- Adoptar patrón `CRON_SECRET` (ya existe en `generate-recurring-maintenance`): header `x-cron-secret` obligatorio en modo no-test; 401 si falta o no coincide.
- Nueva migración con `pg_cron` + `net.http_post` para agendar ambas funciones cada 5 min, pasando el secret desde `vault`.
- Documentar el secret como requerido en el runbook interno (comentario en la función).

## 3. Timeout `stamp-cfdi` → riesgo de doble timbrado

**Problema**: `Promise.race` con timeout 30s sin `AbortSignal`. Facturapi puede completar server-side después del timeout; el reintento llama `invoices.create` otra vez → 2 CFDI válidos por la misma operación.

**Fix**
- Reemplazar `Promise.race` por `AbortController` real pasado a `fetch`.
- Tras timeout, dejar la fila en `cfdi_status='stamping'` (no `error`) y persistir `facturapi_invoice_id` si se tenía; **no** encolar reintento inmediato. El reconciliador la resolverá por folio o UUID.
- Cubrir con test que simule timeout: la fila queda `stamping`, no se reintenta, reconcile la levanta.

## 4. `reconcile-stamping-invoices` marca `stamped` sin XML

**Problema**: catch de download solo loguea; RPC marca `stamped` con `p_cfdi_xml: null`. Factura queda fiscalmente incompleta y ningún cron la vuelve a tocar.

**Fix**
- Si falla la descarga de XML/PDF, **no** llamar el RPC de `stamped`; incrementar contador de intento y dejar la fila en `stamping` para próximo ciclo.
- Máximo N intentos de reconcile por fila (usar `cfdi_reconcile_attempts int` en `invoices` o piggyback en `cfdi_retry_queue`) antes de escalar a alerta.
- Test: mock de descarga que falla → invoice sigue `stamping`, no queda `stamped`.

## 5. BL-A5 · Reconciliación de total timbrado (falso positivo del changelog)

**Problema**: v7.114.0 afirma que existe `stamp_variance` + `_shared/money.ts`. **Ninguno existe**. `Math.round` sigue en `stamp-cfdi/handler.ts:289`. El equipo cree resuelto un hallazgo abierto.

**Fix**
- Crear `supabase/functions/_shared/money.ts` con `toCents`, `fromCents`, `sumCents`, `roundHalfEven` (paridad con `src/lib/money`).
- Reemplazar `Math.round` en `stamp-cfdi/handler.ts` por las utilidades nuevas.
- Añadir columna `invoices.stamp_variance numeric(12,4)` (diferencia total local vs total timbrado por Facturapi).
- Trigger o post-stamp update que calcule la varianza; si `|variance| > 0.02` MXN → log de alerta + fila en `cfdi_retry_queue` operación `reconcile_totals` (o simplemente flag para el reporte).
- Test unitario del helper + test de integración del handler con totales fraccionarios.

---

## Detalles técnicos

- **Migraciones nuevas** (orden):
  1. `pg_cron` schedules para ambas edge functions (o solo comentario + Scheduled Functions si prefieren dashboard).
  2. `ALTER TABLE invoices ADD COLUMN stamp_variance numeric(12,4)`.
- **Sin cambios de RLS**; todo el trabajo es sobre tablas ya políticadas.
- **Sin edición de** `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `config.toml` (solo si Scheduled Functions lo exigen — en ese caso avisar).
- **Tests**: extender `process-cfdi-retry-queue/index_test.ts`, `reconcile-stamping-invoices/index_test.ts`, `stamp-cfdi/index_test.ts` y nuevos `_shared/money_test.ts`.
- **Changelog**: entrada `v7.133.0` (minor: rescata fixes rotos + endurece infra CFDI). Índice + detalle.

## Fuera de alcance (agendar aparte)

- Paths rotos de cancelación de la cola (mapping `cancel_rep`, cancel-cfdi sin bypass service_role, ningún cancel-* encola). → Lote siguiente.
- Soft-delete leak en `get_available_forklifts`/`create_booking`, materialización de `rented`, revenue multi-reserva en `report_profit_by_model`, migración de UI de extensión de reserva. → Ola de Business Logic.
- 26 hallazgos de UI/Mejoras/Pulido. → Olas UX + Higiene.

## Verificación

1. `bun run test` — todos los tests nuevos y existentes en verde.
2. `supabase db push` local — migraciones aplican limpio.
3. `bunx tsgo --noEmit` — sin errores de tipos.
4. Manual: encolar una fila terminal en `cfdi_retry_queue`, correr el consumer, confirmar que la fila pasa a `exhausted` (no queda `pending`).
