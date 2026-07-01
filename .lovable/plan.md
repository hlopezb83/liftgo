## Problema

Al cancelar FAC-0076 dejamos `cfdi_status = 'cancelled'`, y tanto la Edge Function `download-cfdi` como los botones de la UI bloquean todo lo que no sea `'stamped'`. Además nunca implementamos la descarga del **acuse de cancelación** (constancia SAT en PDF/XML) que Facturapi expone en `/v2/invoices/{id}/cancellation_receipt/{pdf|xml}`.

## Solución

### 1. `supabase/functions/download-cfdi/index.ts`
- Aceptar `cfdi_status IN ('stamped','cancelled')` en el guard de facturas y de complementos de pago (mismo cambio para `rep_cfdi_status`).
- Ampliar el `format` permitido a `'pdf' | 'xml' | 'acuse_pdf' | 'acuse_xml'`.
- Cuando `format` empieza con `acuse_`:
  - Exigir `cancellation_status === 'accepted'`; si no, 409 con mensaje "El acuse aún no está disponible".
  - Descargar de Facturapi vía `GET /v2/invoices/{facturapi_id}/cancellation_receipt/{pdf|xml}` con el mismo retry 5xx que ya usamos.
  - Guardar en Storage bajo `{invoice_id}/acuse-{uuid}.{pdf|xml}` y persistir en dos columnas nuevas.
- Nombre de archivo: `Acuse-{invoice_number}.{ext}`.

### 2. Migración: columnas para archivar el acuse
`invoices.acuse_pdf_url text`, `invoices.acuse_xml_url text` (nullable). Sin cambios de RLS.

### 3. UI — `InvoiceDetailActions.tsx` + `InvoicePDFButton.tsx`
- Renombrar el flag `isStamped` a algo como `hasCfdi = cfdiStatus === 'stamped' || cfdiStatus === 'cancelled'` para habilitar los botones de PDF y XML también cuando la factura está cancelada.
- Añadir botón/menú **"Descargar acuse"** visible sólo cuando `cancellation_status === 'accepted'`, con dos acciones (PDF y XML) que llaman `download-cfdi` con los formatos nuevos.
- El botón "Cancelar CFDI" sigue oculto para facturas ya canceladas (ya lo hace `isPendingCancel`/`cfdi_status`).

### 4. Hook de descarga
`useDownloadInvoiceXml` y el flujo de PDF ya invocan `download-cfdi` con `{ invoice_id, format }`. Se agrega un hook chico `useDownloadCancellationReceipt(format)` que reutiliza `downloadCfdiBlob` con los nuevos formatos.

### 5. Changelog `v6.105.0` (minor: feature de acuse)
Entrada nueva en `public/changelog.json` + `public/changelog/v6.105.0.json` describiendo:
- Se puede volver a descargar XML y PDF de facturas ya canceladas.
- Nueva opción "Descargar acuse de cancelación" (PDF/XML) desde Facturapi.

## Fuera de alcance
- No se toca la lógica de cancelación en sí ni `refresh-cancellation-status`.
- No se agrega el acuse a complementos de pago (payments) — sólo facturas, como pide el usuario.
- No se genera el acuse local; se descarga siempre de Facturapi y se cachea en Storage.
