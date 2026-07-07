## Estado actual (FAC-0089)

Consulté la BD y la NC de FAC-0089 existe pero **nunca se timbró**:

- `credit_notes.id = 2bc332c8-fc8f-4afe-a8af-8637ac0c91a0`
- `cfdi_status = "pending"`, `status = "draft"`
- `cfdi_uuid = null`, `cfdi_error_message = null`
- `updated_at == created_at` (19:08:05) → **el "claim atómico" nunca corrió**
- Factura padre (folio 89) está `stamped` con `facturapi_invoice_id` OK.

La Edge Function `stamp-credit-note` sí booteó (19:08:06) pero **no dejó logs de error**: devolvió un `non-2xx` silencioso antes de intentar Facturapi. Sin el texto del toast rojo y sin logs no es posible identificar 401/403/400/404 con certeza.

Como eres **Admin**, el 403 queda descartado. Los candidatos reales son:
- Falla de red al `getClaims` (401)
- Excepción no capturada que cae al `catch` final (500 "Internal server error")
- Falla intermitente del SDK al fetchear `credit_notes`/`invoices`

## Plan

### 1. Observabilidad en `stamp-credit-note/handler.ts`

Agregar `console.error` estructurado en **cada** ruta de error (antes de cada `return json({...}, 4xx|5xx)`) con `credit_note_id`, `userId` (si ya se resolvió) y motivo, más un `console.error` en el `catch` final que incluya `err instanceof Error ? err.message + err.stack : String(err)`. Sin datos sensibles. Esto es puramente diagnóstico: cero cambios de comportamiento.

Aplicar el mismo patrón a `stamp-cfdi/handler.ts` y `stamp-payment-complement/handler.ts` para consistencia (mismos síntomas silenciosos).

### 2. Retry desde UI (ya existe, sin cambios)

`InvoiceCreditNotesCard.tsx` ya muestra un botón **"Timbrar"** para NCs con `cfdi_status !== 'stamped'` (línea 121, usa `useStampCreditNote`). El usuario puede reintentar timbrando la NC actual sin recrearla.

### 3. Cambelog

Agregar entrada `v6.110.3` (patch) en `public/changelog.json` + `public/changelog/v6.110.3.json` con título "Logs de diagnóstico al timbrar CFDI/NC/REP".

### 4. Validación

- `bunx tsgo --noEmit`
- Reintentar el timbrado desde la UI (botón "Timbrar" en la card de NCs de FAC-0089) — con los nuevos logs, si vuelve a fallar veremos exactamente en qué punto.

## Fuera de alcance

- No se modifica lógica de negocio, RLS, ni el frontend de creación de NC.
- No se hace "auto-retry" ni se cambian códigos de status HTTP.
- No se toca `stamp-cfdi/index.ts` ni `stamp-credit-note/index.ts` (solo los `handler.ts`).

## Detalles técnicos

Los handlers usan un `try/catch` externo que retorna `500 "Internal server error"` sin loguear. Ejemplo del cambio:

```ts
} catch (err) {
  console.error("[stamp-credit-note] unhandled error", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return json({ error: "Internal server error" }, 500, { ... });
}
```

Y en cada `return json({ error: ... }, 4xx, ...)` intermedio, un `console.error("[stamp-credit-note] <motivo>", { credit_note_id, userId })` justo antes.
