# Notas de Crédito (CFDI tipo Egreso)

Hoy el sistema timbra facturas (Ingreso) y complementos de pago (REP). Falta el tercer documento fiscal del ciclo en México: la **Nota de Crédito** (CFDI tipo "E"), que se usa para devoluciones, descuentos posteriores, correcciones de monto y saldos a favor.

## Alcance confirmado

- Siempre ligada a una factura timbrada (CFDI relacionado tipo **01 – Nota de crédito de los documentos relacionados**)
- Reduce automáticamente el saldo pendiente de la factura origen
- Se crea exclusivamente desde el detalle de la factura
- Cubre 4 casos de uso: devoluciones de renta, descuentos/bonificaciones, corrección de montos, saldos a favor

## Cambios de base de datos

**Nueva tabla `credit_notes`** con: `id`, `credit_note_number` (NC-XXXX vía RPC), `invoice_id` (FK lógico a facturas), `customer_id`, `motive` (`return` | `discount` | `correction` | `credit_balance`), `reason_text`, `line_items` (JSONB editables), `subtotal`, `tax_rate` (16/11/0), `tax_amount`, `total`, `currency`, `issued_at`, `status` (`draft` | `stamped` | `cancelled`), columnas SAT (`cfdi_uuid`, `cfdi_xml_url`, `cfdi_pdf_url`, `cfdi_status`, `cfdi_error_message`, `facturapi_invoice_id`, `cancellation_status`, `cancellation_motive`, `substitution_uuid`, `cancelled_at`), auditoría.

**Tabla `invoices`**: agregar columna calculada `credited_amount` (suma de NCs timbradas no canceladas). El "saldo pendiente" pasa a ser `total - pagos - credited_amount`.

**RLS**: mismas reglas que `invoices` (Admin/Administrativo/Dispatcher full, Auditor read). Borrado solo en draft.

**RPC `generate_credit_note_number()`** análogo a facturas (prefijo `NC-`).

## Edge functions

- **`stamp-credit-note`** — toma la NC en draft, llama `POST /v2/invoices` de Facturapi con `type: "E"`, `related_documents: [{ relationship: "01", documents: [invoice.facturapi_invoice_id] }]`, descarga XML y PDF oficiales y los guarda en bucket `cfdi-files/credit-notes/{id}/`.
- **`cancel-credit-note`** — reusa el patrón de `cancel-cfdi` (motivos 01–04, query string, manejo de `pending`/`accepted`).
- **`download-cfdi`** — extender para soportar `credit_note_id` (XML/PDF SAT).

## UI

**`InvoiceDetailActions`**: nuevo botón "Crear Nota de Crédito" visible solo si la factura está timbrada (`cfdi_status === "stamped"`) y no totalmente cancelada.

**`CreateCreditNoteDialog`** (nuevo):
- Selector de motivo (4 opciones con descripción)
- Tabla de conceptos precargada con las líneas de la factura, cantidades y montos editables (no se puede exceder el saldo no acreditado de cada línea)
- Campo `reason_text` obligatorio (referencia interna)
- Totales calculados con el mismo IVA de la factura origen
- Botón "Guardar borrador" y "Guardar y timbrar"

**`InvoiceDetail`** — nueva sección "Notas de Crédito" arriba de "Historial de pagos":
- Tabla compacta zebra con: número NC, fecha, motivo, monto, estado SAT, acciones (Ver PDF SAT, Descargar XML, Timbrar si draft, Cancelar si timbrada)
- Drill-down panel con detalle completo
- Badge de "Pendiente cancelación SAT" cuando aplique

**`InvoicePaymentSummary`** — el cálculo de "Saldo pendiente" debe restar `credited_amount`. Mostrar línea "Notas de crédito aplicadas" cuando exista.

**`CancelCreditNoteDialog`** — reusa la UI de `CancelCfdiDialog`.

## Reglas de negocio

- No se puede crear NC sobre factura en estado `pending`, `error` o `cancelled`
- El total de NCs activas + pagos no puede exceder el total de la factura
- Al timbrar la NC, si los pagos + créditos cubren el total → la factura pasa a `paid` automáticamente
- Cancelar una NC timbrada (aceptada por SAT) revierte su efecto en el saldo
- Las NCs en `draft` se pueden editar y eliminar libremente; las timbradas son inmutables

## Changelog

Nueva versión **`v6.19.0`** (minor — nueva funcionalidad fiscal mayor): archivo `public/changelog/v6.19.0.json` + entrada en `public/changelog.json`.

## Notas técnicas (referencia)

- Endpoint Facturapi: `POST /v2/invoices` con `type: "E"`, `use: "G02"` (devoluciones) por defecto, `payment_form: "01"` (efectivo, irrelevante para Egreso pero requerido)
- `related_documents.relationship: "01"` es el código SAT para nota de crédito
- El IVA debe coincidir con la factura origen para que SAT acepte el relacionamiento
- Bucket `cfdi-files` ya existe; solo se agrega prefijo `credit-notes/`
