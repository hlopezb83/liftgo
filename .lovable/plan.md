
## Diagnóstico

El timbrado falló con error de Facturapi **CFDI40148**:

> "El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor."

Esto **no es un bug de código** — es un dato incorrecto. El SAT valida que el **código postal fiscal** del receptor (DomicilioFiscalReceptor) coincida con el que tiene registrado el RFC en la Constancia de Situación Fiscal (CSF). En la factura `430e32af-0391-4fc1-aed4-a7317ff710b0`, el CP del cliente no corresponde al RFC capturado.

Causas típicas:
1. CP del cliente mal capturado o desactualizado (el contribuyente cambió domicilio fiscal en SAT y nuestro registro quedó viejo).
2. RFC equivocado para ese nombre/razón social.
3. Cliente "Público en General" sin reasignar (RFC genérico XAXX010101000 requiere CP del emisor, no del receptor real).

## Plan

### 1. Acción inmediata para el usuario (sin código)
Validar contra la CSF del cliente:
- Abrir el detalle del cliente de esa factura.
- Pedir/subir CSF actualizada (ya hay `CsfDropzone`) y confirmar **RFC + CP fiscal + Régimen + Razón social** exactos como SAT los tiene.
- Corregir el campo CP en el cliente, regenerar la factura (o re-timbrar si aún está como borrador) y reintentar.

### 2. Mejora UX en el frontend (precheck + mensaje claro)
Actualmente el error llega como `Facturapi error: 400` genérico. Cambios acotados a presentación:

- **`src/features/invoices/lib/facturapiErrors.ts`**: mapear código `CFDI40148` (y vecinos comunes: `CFDI40147`, `CFDI40149`) a mensaje accionable en español:
  > "El código postal fiscal del cliente no coincide con el RFC en el SAT. Verifica la Constancia de Situación Fiscal del cliente y corrige el CP."
- **`src/features/invoices/lib/cfdiPrechecks.ts`**: agregar precheck antes de invocar `stamp-cfdi`:
  - CP receptor presente y 5 dígitos.
  - RFC con formato válido.
  - Régimen fiscal presente.
  - Si cliente es genérico (`XAXX010101000` / `XEXX010101000`), validar que el CP usado sea el del emisor.
- **`ErrorDetailsDialog`**: ya muestra `details`; verificar que `useStampInvoiceFlow` propague el `code` y el `message` de Facturapi (hoy el handler los recibe pero el cliente solo ve "Facturapi error: 400").

### 3. Propagación del error desde la Edge Function
Revisar `supabase/functions/stamp-cfdi/handler.ts` y `src/lib/supabase/invokeEdgeFunction.ts`:
- Confirmar que el body de error de Facturapi (`{message, code, status}`) se devuelva al cliente en lugar de aplanarse a `Facturapi error: 400`.
- En `useStampCfdi` / `useStampInvoiceFlow`, leer `code` y mapear vía `facturapiErrors.ts`.

### 4. Test
- Test en `src/features/invoices/lib/__tests__/facturapiErrors.test.ts` para `CFDI40148` → mensaje en español.
- Test del precheck para CP/RFC/régimen faltantes.

### 5. Changelog
- `public/changelog.json` + `public/changelog/v6.95.1.json` (patch): "Mensaje claro y precheck para error SAT CFDI40148 (CP fiscal del receptor)."

## Fuera de alcance
- No se modifica lógica de negocio del COGS (cambio anterior).
- No se altera `stamp-cfdi` más allá de propagar mejor el error.
- No se autocompleta CP desde CSF en este cambio (potencial mejora futura).

## Pregunta para ti
¿Quieres también que agregue un botón **"Ver CSF del cliente"** directo en el `ErrorDetailsDialog` cuando el código sea `CFDI40148/47/49`, para acelerar la corrección? (Opcional, suma ~20 LOC.)
