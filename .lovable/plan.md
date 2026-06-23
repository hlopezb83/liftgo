## Problema

En `/invoices/53dec3e3-…` el usuario disparó una acción (probablemente **Timbrar CFDI**) y recibió un toast genérico:

> Edge Function returned a non-2xx status code

Causa raíz: el SDK de Supabase (`supabase.functions.invoke`) devuelve un `FunctionsHttpError` cuyo `message` es siempre ese string genérico — el cuerpo JSON real de la respuesta (`{ error: "Invoice already stamped" | "Company settings not configured" | "Facturapi error: 400" | … }`) queda atrapado en `error.context` (la `Response`) y nuestros hooks lo descartan haciendo `throw error` directo.

Los logs de la función confirman el timing exacto:
- `stamp-cfdi` booteó a las `2026-06-23T19:05:55Z`
- Error en cliente a las `19:06:00.192Z` → 5 s después → fue una llamada real, no un fallo de boot.

El handler de `stamp-cfdi` puede devolver no-2xx por varias razones legítimas (409 ya timbrada, 400 sin company settings, 502 Facturapi, 403 rol, 404 invoice). Hoy ninguna llega al usuario.

## Solución

Centralizar la extracción del cuerpo de error de Edge Functions en un helper y aplicarlo a **todos** los hooks que invocan funciones (no sólo CFDI), de modo que el toast muestre el mensaje real del backend.

### 1. Helper nuevo `src/lib/supabase/invokeEdgeFunction.ts`

Wrapper sobre `supabase.functions.invoke` que:
- Llama `invoke(name, options)`.
- Si hay `error` y `error.context` es una `Response`, intenta `await error.context.clone().json()` y extrae `body.error` / `body.detail` / `body.message`.
- Construye y lanza un `Error` con el mensaje real (ej. `"Invoice already stamped"`), preservando `cause: error` para Sentry/telemetry.
- Si el body no es JSON parseable, hace fallback al `statusText` o al mensaje original.
- Tipado genérico `<T>` para el `data` devuelto.

### 2. Refactor de hooks que invocan Edge Functions

Reemplazar el patrón `const { data, error } = await supabase.functions.invoke(...)` por el helper en:

- `src/features/invoices/hooks/invoices/cfdi/useStampCfdi.ts`
- `src/features/invoices/hooks/invoices/cfdi/useCancelCfdi.ts`
- `src/features/invoices/hooks/invoices/cfdi/useRefreshCancellationStatus.ts`
- `src/features/invoices/hooks/invoices/cfdi/usePaymentComplement.ts`
- `src/features/invoices/hooks/invoices/pdf/useInvoicePdfDownload.ts`
- `src/features/invoices/hooks/invoices/useRecordPaymentForm.ts` (si invoca)
- `src/features/invoices/hooks/invoices/recurring/useGenerateRecurringInvoices.ts`
- `src/features/invoices/hooks/creditNotes/useCreditNoteMutations.ts`
- `src/features/invoices/lib/downloadCfdiBlob.ts`
- `src/features/maintenance/hooks/maintenance/useGenerateRecurringMaintenance.ts`
- `src/features/portal/hooks/paymentIntents/useCreatePaymentIntent.ts`

`translateFacturapiError` se sigue aplicando en `useStampCfdi.onError` sobre el mensaje ya extraído (mejora porque ahora recibirá el detalle real de Facturapi en lugar del string genérico).

### 3. Observabilidad mínima en `stamp-cfdi`

Agregar `console.error` en handler.ts en los `return json(...)` con status ≥ 400 (rolesErr, invoice not found, already stamped, company missing, Facturapi error, DB update error) para que aparezcan en `edge_function_logs` la próxima vez. Sin PII: sólo status + razón corta + invoice_id.

### 4. Tests

- `src/lib/supabase/__tests__/invokeEdgeFunction.test.ts`: cubre (a) éxito, (b) error con body JSON `{ error: "X" }`, (c) error con body no-JSON, (d) error sin `context`.
- Actualizar `src/features/invoices/hooks/invoices/cfdi/__tests__/useStampCfdi.test.ts` para verificar que un fallo 409 con `{ error: "Invoice already stamped" }` propaga ese mensaje al `onError`.

### 5. Changelog

- Entrada **patch** `v6.75.2` en `public/changelog.json` + `public/changelog/v6.75.2.json` describiendo el fix de mensajes de Edge Functions.

## Lo que NO se toca

- No se modifican las rutas ni las pantallas de invoices.
- No se cambia la lógica de negocio del timbrado, sólo el reporte de errores.
- No se rotan llaves ni se altera Facturapi.

## Validación

1. `bun test` verde para los nuevos/ajustados tests.
2. Reproducir manualmente en `/invoices/:id` (intentando timbrar una factura ya timbrada) — el toast debe mostrar `"Invoice already stamped"` en lugar del mensaje genérico.
3. Revisar `supabase--edge_function_logs stamp-cfdi` y confirmar que las nuevas líneas `console.error` aparecen con el motivo real del 4xx/5xx del request fallido del usuario.
