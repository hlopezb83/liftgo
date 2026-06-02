# PDF oficial SAT + archivado de XML/PDF en Storage

## Objetivo

Cuando se timbra una factura:
1. Descargar XML **y PDF oficial** de Facturapi.
2. Archivarlos en un bucket privado de Storage.
3. Servir el PDF oficial SAT al hacer clic en "Descargar PDF" (reemplazando el PDF interno de jsPDF cuando la factura ya está timbrada).
4. Permitir re-sincronizar contra Facturapi si el archivo falta.

## Cambios

### 1. Storage
- Crear bucket privado `cfdi-files`.
- RLS en `storage.objects`: solo `authenticated` con rol `admin` o `administrativo` pueden leer (entrega real se hace vía edge function con `service_role`, que ignora RLS).

### 2. Edge function `stamp-cfdi` (modificar)
Tras timbrar exitosamente:
- Descargar XML (ya lo hace) **y** PDF de `GET /invoices/:id/pdf` con `Authorization: Bearer apiKey`.
- Subir ambos a `cfdi-files/{invoice_id}/{cfdi_uuid}.xml` y `.pdf` usando el cliente de Supabase con service role.
- Guardar las rutas en `invoices.cfdi_xml_url` y `cfdi_pdf_url` (paths del bucket, no signed URLs).
- Mantener `cfdi_xml` en columna como respaldo (ya existe).

### 3. Nueva edge function `download-cfdi`
- Entrada: `{ invoice_id, format: 'xml' | 'pdf' }`.
- Verifica JWT y rol (`admin`/`administrativo`/`ventas`).
- Lee la factura. Si tiene la ruta en Storage → descarga el binario y lo regresa con `Content-Type` apropiado y `Content-Disposition: attachment; filename="FAC-XXXX.{ext}"`.
- Si no existe en Storage (caso facturas viejas como FAC-0071) → fallback: llama a Facturapi con la API key del workspace, sube al bucket, actualiza columnas, y regresa el binario en la misma respuesta.
- Devuelve 404 si la factura no está timbrada o no hay `facturapi_invoice_id`.

### 4. Frontend
- **`InvoicePDFButton`**: nuevo prop `cfdiStatus`. Si `stamped` → invoca `download-cfdi` con `format: 'pdf'` y descarga el blob (PDF oficial SAT). Si no, conserva flujo actual con jsPDF.
- **`handleDownloadXml`** en `useInvoiceDetailActions`: invoca `download-cfdi` con `format: 'xml'` en vez de leer `invoice.cfdi_xml` localmente; fallback al blob actual si la edge function falla.
- Sin cambios en el menú de Acciones (sigue mostrando "Descargar XML" y el botón "Descargar PDF" sigue en su lugar — solo cambia su contenido).

### 5. Changelog
- `v6.17.0` (minor): "PDF/XML CFDI oficial archivado en Storage".

## Detalles técnicos

- `cfdi_pdf_url` y `cfdi_xml_url` guardarán el path relativo en el bucket (`{invoice_id}/{uuid}.xml`), no una URL firmada. Las URLs firmadas las genera la edge function bajo demanda — más simple y evita URLs expiradas en BD.
- La edge function `download-cfdi` regresa el binario directamente (no signed URL) para simplificar el cliente y mantener control de auditoría.
- Nombre de archivo descargado: `{invoice_number}.pdf` / `.xml` (usa `invoices.invoice_number`).
- Errores se muestran con `sonner`.
- `stamp-cfdi`: si la subida a Storage falla, **no** se aborta el timbrado — solo se logea el error; el botón "Descargar" hará el fallback contra Facturapi.

## Archivos afectados

- `supabase/functions/stamp-cfdi/index.ts` (modificar)
- `supabase/functions/download-cfdi/index.ts` (nuevo)
- `supabase/config.toml` (registrar nueva función con `verify_jwt = false` y validación de JWT en código)
- `src/features/invoices/components/invoices/InvoicePDFButton.tsx`
- `src/features/invoices/hooks/invoiceDetail/useInvoiceDetailActions.ts`
- `src/features/invoices/pages/InvoiceDetail.tsx` (pasar `cfdiStatus` al botón PDF)
- Bucket `cfdi-files` (vía tool de Storage) + migración con RLS de `storage.objects`
- `public/changelog.json` y `public/changelog/v6.17.0.json`

## Fuera de alcance

- Re-timbrar facturas ya stampadas para forzar archivado: se hace bajo demanda al hacer clic en descargar (lazy backfill).
- Mostrar preview inline del PDF SAT (sigue siendo descarga).
