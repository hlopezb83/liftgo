
# PR 5 — Complemento de Pago CFDI (PPD) en CxP

## Concepto clave (importante)

En CxC nosotros **emitimos** el REP vía Facturapi cuando un cliente nos paga. En CxP es al revés: cuando le pagamos a un proveedor con factura PPD, **el proveedor es quien emite el REP** y nos lo envía. Nosotros no lo timbramos; lo **recibimos, validamos y guardamos** como respaldo fiscal del pago.

Por eso el flujo no es "timbrar", sino "registrar/cargar" el REP del proveedor.

## Alcance

### 1. Modelo de datos
Extender `supplier_payments` con campos del REP recibido:
- `rep_required boolean` — derivado: `true` si la factura es PPD y el pago no liquida en el mismo día de emisión.
- `rep_cfdi_uuid uuid` — UUID del REP que mandó el proveedor.
- `rep_xml_url text`, `rep_pdf_url text` — paths en storage (`cfdi-files/supplier-rep/<bill_id>/<payment_id>.xml|pdf`).
- `rep_status text` — enum textual: `not_required`, `pending`, `received`, `rejected`.
- `rep_received_at timestamptz`, `rep_notes text`, `rep_uploaded_by uuid`.

Trigger `set_supplier_payment_rep_required` BEFORE INSERT:
- Si `bill.payment_method_sat = 'PPD'` → `rep_status = 'pending'`, `rep_required = true`.
- Si no → `rep_status = 'not_required'`.

### 2. Validación del XML recibido
Nueva edge function `validate-supplier-rep`:
- Input: `payment_id`, archivo XML (base64).
- Parsea el XML del REP, valida:
  - Es un CFDI tipo `P` (Pago).
  - Contiene `pago20:Pago` con `Monto` que cuadra (±0.01) con `supplier_payments.amount`.
  - El `RfcEmisor` coincide con `suppliers.rfc`.
  - Hay un `pago20:DoctoRelacionado` cuyo `IdDocumento` coincide con `supplier_bills.cfdi_uuid`.
- Si valida: sube XML al bucket `cfdi-files`, guarda `rep_cfdi_uuid`, `rep_status='received'`, `rep_received_at=now()`.
- Si no valida: regresa `400` con motivo y deja `rep_status='pending'` con `rep_notes`.
- Opcional: PDF — si el usuario carga PDF, se sube sin validación a `rep_pdf_url`.

### 3. RPCs
- `mark_supplier_rep_rejected(p_payment_id, p_notes)` — Admin/Administrativo; pasa a `rejected` cuando el XML del proveedor está mal y queremos pedirle reenvío.
- `reset_supplier_rep_pending(p_payment_id)` — vuelve a `pending` para reintento.
- Borrado: si `rep_status='received'` y rol Admin → permite borrar archivos y volver a `pending`.

### 4. UI — Detalle de la factura
En `SupplierBillDetailSheet`, dentro de cada pago listado:
- Badge `REP: pendiente / recibido / rechazado / no requiere`.
- Botón "Cargar REP" → abre `UploadSupplierRepDialog`:
  - Dropzone XML obligatorio + PDF opcional.
  - Llama a `validate-supplier-rep`; muestra errores de validación inline.
- Si `received`: links a descargar XML/PDF, mostrar UUID, botón "Marcar rechazado" (Admin).
- Si `rejected`: badge + notas + botón "Reintentar carga".

### 5. KPI y filtros
- En `AccountsPayableKpiCards`: nueva tarjeta **"REP pendientes"** = cantidad de pagos PPD con `rep_status='pending'` (clickeable al listado filtrado).
- En `/cuentas-por-pagar`: filtro adicional "REP" (`Todos / Pendiente / Recibido / Rechazado / No requiere`); aplica a nivel factura (incluye facturas con al menos un pago en ese estado).

### 6. Bitácora y actividad
- `activity_feed`: `supplier_payment.rep_uploaded`, `supplier_payment.rep_rejected`, `supplier_payment.rep_reset` (es-MX).
- Audit trail: incluir `supplier_payments` con diff row-level (ya está la infra).

### 7. Permisos
- Cargar REP: Admin + Administrativo.
- Marcar rechazado / reset: Admin + Administrativo.
- Auditor: solo lectura y descarga.

### 8. Tests
- Trigger: pago en factura PUE → `not_required`; en PPD → `pending`.
- `validate-supplier-rep` rechaza XML que:
  - no es tipo P,
  - monto no cuadra,
  - RFC emisor != supplier.rfc,
  - UUID del DoctoRelacionado != bill.cfdi_uuid.
- `validate-supplier-rep` exige rol Admin/Administrativo (401/403 para Ventas).
- KPI "REP pendientes" no cuenta pagos `not_required` ni `received`.

### 9. Changelog
`v6.30.0` (minor) — "Recepción de Complementos de Pago (REP) de proveedores".

## Fuera de alcance
- Solicitar/automatizar la descarga del REP desde el SAT (requiere CIEC del proveedor; no aplica).
- Validar el sello SAT del REP criptográficamente (solo validamos estructura y datos de negocio).
- Generar nuestro propio REP (no aplica, somos el receptor).
- OCR de PDF para extraer UUID (solo XML).

## Notas técnicas

```text
supabase/migrations/<ts>_cxp_rep_intake.sql
  - ALTER TABLE supplier_payments ADD rep_required, rep_cfdi_uuid, rep_xml_url, rep_pdf_url,
        rep_status, rep_received_at, rep_notes, rep_uploaded_by
  - CREATE INDEX supplier_payments_rep_status_idx (WHERE rep_status='pending')
  - CREATE FUNCTION set_supplier_payment_rep_required() trigger BEFORE INSERT
  - CREATE FUNCTION mark_supplier_rep_rejected / reset_supplier_rep_pending (SECURITY DEFINER, SET search_path=public)

supabase/functions/validate-supplier-rep/index.ts
  - JWT validate, role check (admin/administrativo)
  - Parse XML con regex/DOMParser (cfdi:Comprobante TipoDeComprobante='P', cfdi:Emisor Rfc, pago20:Pago Monto, pago20:DoctoRelacionado IdDocumento)
  - Upload a storage; update supplier_payments

src/features/accounts-payable/
  components/UploadSupplierRepDialog.tsx
  components/SupplierRepStatusBadge.tsx
  components/SupplierPaymentRepRow.tsx        # render dentro de la lista de pagos
  hooks/useSupplierRepMutations.ts            # validate, reject, reset
  lib/supplierRepConstants.ts                 # REP_STATUS_LABELS
```

- El bucket `cfdi-files` ya existe; reutilizamos con prefijo `supplier-rep/<bill_id>/<payment_id>.xml`.
- Si el proveedor manda un REP con varios `DoctoRelacionado`, solo validamos que **uno** de ellos sea nuestra factura; el monto total del REP puede ser mayor (caso pago consolidado a varias facturas suyas).
- En `supplier_payments` existente sin REP: trigger solo aplica a nuevos. Ofrecemos botón "Cargar REP" en pagos viejos PPD que migren a `pending` por backfill: una sentencia `UPDATE` en la migración marca todos los pagos existentes ligados a facturas PPD como `pending`; el resto queda `not_required`.

