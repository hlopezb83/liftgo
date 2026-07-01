## Diagnóstico

La factura FAC-0076 fue timbrada correctamente hace unos minutos (`cfdi_status='stamped'`, UUID válido, modo `live`), pero al descargar XML/PDF sale `Facturapi error: 502`.

Auditando la BD y el código:

- `invoices.cfdi_xml_url` = NULL, `cfdi_pdf_url` = NULL, `cfdi_xml` = NULL. **Nada quedó archivado en Storage al timbrar.**
- `supabase/functions/stamp-cfdi/handler.ts` (líneas 308-334) intenta descargar el XML y el PDF desde Facturapi y subirlos a Storage justo después del timbrado, pero envuelve cada intento en `try { ... } catch (_e) { /* keep null */ }`. Si Facturapi contesta 5xx en ese momento (como pasó hoy), **se traga el error en silencio** y la factura queda timbrada sin respaldo local.
- `supabase/functions/download-cfdi/index.ts` (líneas 394-406) llama a Facturapi una sola vez y, si contesta 5xx, devuelve el 502 tal cual. No hay reintento.

Resultado: cada descarga posterior depende 100% de que Facturapi esté sano en ese instante. Un 502 transitorio de Facturapi rompe la descarga hasta que ellos se recuperen.

## Cambios propuestos

**1. `supabase/functions/_shared/facturapi/client.ts`**
- Añadir helper `retryOnFacturapi5xx(fn, { attempts = 3, baseDelayMs = 400 })` que reintenta con backoff exponencial (400ms, 1200ms) solo cuando `describeFacturapiError(err).status` esté entre 500 y 599 o sea `0` (timeout de red). No reintenta 4xx (validaciones).

**2. `supabase/functions/download-cfdi/index.ts`**
- Envolver `client.invoices.downloadXml/downloadPdf` con `retryOnFacturapi5xx`.
- Si tras los reintentos sigue siendo 5xx, devolver `502` con mensaje más útil: `"Facturapi no está disponible temporalmente. Reintenta en unos segundos."` (mantener `detail` para debug).

**3. `supabase/functions/stamp-cfdi/handler.ts`**
- Reintentar la descarga del XML y del PDF con `retryOnFacturapi5xx` antes de rendirse.
- Reemplazar los `catch (_e) { }` mudos por `console.error("[stamp-cfdi] archive xml failed", { invoice_id, err })` para que quede rastro en logs.
- Aplicar el mismo patrón en `stamp-credit-note/index.ts` y `stamp-payment-complement/index.ts` si comparten el mismo flujo (verificar en implementación; si no lo comparten, dejarlos fuera de este cambio).

**4. UI — `InvoiceDetail` (hooks de descarga)**
- Detectar `error.message?.includes("Facturapi")` o status 502 en la respuesta y mostrar toast:
  `"Facturapi está experimentando problemas. Intenta de nuevo en unos segundos."` en vez del mensaje crudo `"Facturapi error: 502"`.

**5. Backfill puntual (una sola vez, vía SQL/consola)**
- No modificamos la BD en este plan; una vez desplegados los cambios, el usuario reintenta la descarga y `download-cfdi` archivará el XML/PDF en Storage para futuras descargas. No requiere script de backfill.

**6. Changelog**
- Nueva entrada `v6.103.4` (patch, `fix`) en `public/changelog.json` + `public/changelog/v6.103.4.json` describiendo: reintentos ante 5xx de Facturapi al descargar y timbrar, y mejora de mensaje al usuario.

## Fuera de alcance

- No cambiar el diseño del modal de descarga ni la lógica de facturación.
- No tocar `facturapi_mode` ni claves PAC.
- No agregar un job de reconciliación programada (se puede considerar en un plan aparte si vuelve a ocurrir).

## Verificación

- Deploy de las 2 (o 4) edge functions afectadas.
- El usuario reintenta descarga de FAC-0076: debe funcionar y quedar respaldada en Storage (`cfdi_xml_url` y `cfdi_pdf_url` no nulos después).
- Correr los tests existentes de `stamp-cfdi/handler_test.ts` para no romper el flujo de timbrado.
