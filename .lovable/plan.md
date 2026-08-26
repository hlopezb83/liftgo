# fix-20.diff — validación y plan de aplicación

Revisé los 5 hallazgos contra el código actual. **Los 5 son bugs reales** y valen la pena. Analogía: hoy el "apartado" de cancelación (el letrero de "ocupado" en la puerta del baño) a veces se queda puesto para siempre, y a veces se quita cuando no debería.

## Hallazgos validados

**R4-01 — Claim de cancelación atascado en `pending`**
`cancel-credit-note/index.ts` y `cancel-payment-complement/handler.ts` definen `releaseClaim` *dentro* del `try`. Si algo revienta después del claim y antes de llamar al PAC, el `catch` devuelve 500 y el documento queda en `cancellation_status = 'pending'` para siempre. `cancel-cfdi` ya resuelve esto con refs fuera del `try`; estos dos no.

**R4-02 — El claim no admite reintentos de cancelaciones rechazadas/expiradas**
`cancel-cfdi` ya usa `.in("cancellation_status", ["none","rejected","expired"])` (línea 187). Las otras dos siguen con `.eq(..., "none")`, así que una cancelación rechazada por el SAT nunca se puede reintentar: siempre responde 409.

**R4-05 — Timeout del PAC libera el claim (riesgo de doble cancelación)**
En ambas funciones, ante timeout se llama `releaseClaim()`. Pero un timeout no significa que el SAT no recibió la solicitud: solo se perdió la respuesta. Liberar invita a un segundo envío. `cancel-cfdi` ya conserva `pending`.

**R4-14 — El reset de 72 h nunca dispara**
`refresh-cancellation-status/handler.ts` mide la antigüedad del `pending` con `updated_at`, que cualquier UPDATE ajeno reinicia (el claim de `reconcile-stamping-invoices` lo toca en cada corrida). Resultado: el desbloqueo automático puede no ocurrir jamás.

**R4-13 — Los aplazamientos de infraestructura queman intentos**
En `process-cfdi-retry-queue/index.ts`, cuando falla el lookup del PAC o no hay API key, la fila se difiere pero incrementa `attempts`. Al configurarse la key, la fila ya puede estar agotada sin haber intentado nunca un timbrado real.

## Qué se va a implementar

1. **R4-01**: mover refs (`supabaseRef`, id, `claimed`, `pacAttempted`) fuera del `try` en `cancel-credit-note/index.ts` y `cancel-payment-complement/handler.ts`; en el `catch`, liberar el claim solo si `pacAttempted === false`.
2. **R4-02**: cambiar el claim a `.in([...,"rejected","expired"])` en ambas y ajustar el mensaje 409 a español mexicano indicando que rechazadas/expiradas sí se pueden reintentar.
3. **R4-05**: en timeout del PAC, **no** liberar el claim; devolver 504 con mensaje que sugiere consultar `refresh-cancellation-status` antes de reintentar.
4. **R4-14**: migración nueva `cancellation_requested_at` (invoices, credit_notes) y `rep_cancellation_requested_at` (payments); fijarlas en los tres claims (cancel-cfdi, cancel-credit-note, cancel-payment-complement) y usarlas en el reset de 72 h con fallback a `updated_at`.
5. **R4-13**: los deferrals de infraestructura conservan `attempts` (no incrementan) pero calculan el backoff con `attempts + 1`.

## Notas técnicas

- La migración es solo `add column if not exists` sobre tablas existentes con RLS ya activo; no crea tablas, así que no requiere policies ni GRANT nuevos. Cumple `scripts/lint-migrations.ts`.
- Efecto secundario aceptado de R4-13: sin API key, una fila puede quedarse en `pending` reintentando indefinidamente en lugar de agotarse. Es el comportamiento deseado (nada que reintentar hasta que exista configuración), pero queda visible en `last_error`.
- Se actualizarán las pruebas Deno afectadas de `cancel-payment-complement` y `refresh-cancellation-status` que asumen la liberación del claim en timeout.
- Versión: **7.351.0** (minor: cambios de comportamiento + columnas nuevas) con entrada en `public/changelog.json` y `public/changelog/v7.351.0.json`.
- Verificación: `deno check`/`deno lint`/`deno fmt`, pruebas de edge functions y `bunx vitest run`.
