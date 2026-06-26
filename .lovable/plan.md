
# Migrar Edge Functions al SDK oficial de Facturapi

Actualmente todas las Edge Functions de CFDI usan `fetch` directo contra `https://www.facturapi.io/v2` con `Basic auth` manual. Migraremos al SDK oficial (`npm:facturapi`) que ya está mantenido por Facturapi, maneja auth, serialización, paginación y errores de forma idiomática.

## Alcance

Funciones afectadas (8):
- `stamp-cfdi/handler.ts` — crear, obtener XML y PDF
- `stamp-credit-note/handler.ts` — crear nota de crédito
- `stamp-payment-complement/index.ts` — crear complemento de pago
- `cancel-cfdi/handler.ts` — cancelación con motivo
- `cancel-credit-note/index.ts`
- `cancel-payment-complement/handler.ts`
- `refresh-cancellation-status/handler.ts`
- `download-cfdi/index.ts` — XML/PDF de factura, NC y complemento

## Plan técnico

1. **Helper compartido** `supabase/functions/_shared/facturapi/client.ts`:
   - Import: `import Facturapi from "npm:facturapi@^5";`
   - Exporta `getFacturapiClient(env: "test" | "live", deps)` que resuelve la API key (igual que hoy: primero `tenant_facturapi_keys` desde BD, luego env `FACTURAPI_TEST_KEY`/`FACTURAPI_LIVE_KEY`) y devuelve `new Facturapi(key)`.
   - Exporta `translateSdkError(err)` que extrae `err.message` y código (`err.response?.data?.code`) preservando el mapeo actual de `translateFacturapiError.ts`.

2. **Refactor por función** — reemplazar llamadas:
   - `fetch(${BASE}/invoices, POST)` → `client.invoices.create(payload)`
   - `fetch(${BASE}/invoices/:id/xml)` → `client.invoices.downloadXml(id)` (devuelve `ReadableStream`; convertir a `string`/`Uint8Array`)
   - `fetch(${BASE}/invoices/:id/pdf)` → `client.invoices.downloadPdf(id)`
   - `fetch(${BASE}/invoices/:id?motive=...)` DELETE → `client.invoices.cancel(id, { motive, substitution })`
   - Status refresh → `client.invoices.retrieve(id)` y leer `status`/`cancellation_status`.

3. **Inyección de dependencias**: hoy las funciones reciben `deps.fetchImpl`. Cambiar el contrato a `deps.getClient(env)` para que los tests puedan inyectar un cliente mock. Mantener `deps.env` y `deps.now` igual.

4. **Tests**:
   - Reemplazar `supabase/functions/_shared/test/facturapiMock.ts` (interceptor de `fetch`) por `supabase/functions/_shared/test/facturapiClientMock.ts` que devuelve un objeto con `invoices.create/retrieve/cancel/downloadXml/downloadPdf` configurables.
   - Actualizar los 8 `*_test.ts` para pasar `getClient` en vez de `fetchImpl`.
   - Conservar fixtures de respuestas (mismos shapes que devuelve el SDK).

5. **Manejo de errores**: el SDK lanza `FacturapiError` con `.message`, `.code`, `.statusCode`. Adaptar `translateFacturapiError.ts` para aceptar tanto el shape actual como el del SDK; conservar mapeos `CFDI40148/40149` añadidos en v6.95.1.

6. **Sin cambios de API pública**: contratos HTTP de las Edge Functions, payloads del frontend y columnas de BD se mantienen idénticos. Es una refactorización interna.

7. **Changelog**: nueva entrada `v6.96.0` (minor — refactor interno significativo, sin cambios de comportamiento).

## Riesgos

- El SDK oficial está en JavaScript; tipos pueden requerir `// @ts-ignore` o `as any` puntual al importar desde Deno con `npm:`. Lo encapsularemos en el helper para no contaminar el resto.
- Si el SDK no expone algún endpoint exacto que usamos (p. ej. parámetro `motive` específico), mantendremos `fetch` directo solo para ese caso aislado.
