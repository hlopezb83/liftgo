

## Editar fecha de pago en FAC-0035 — v5.17.1

### Problema
El historial de pagos en la vista de detalle de factura es solo lectura. No hay forma de modificar la fecha (ni otros datos) de un pago ya registrado.

### Solución
Agregar un botón de edición (icono lápiz) en cada fila del historial de pagos que abra un diálogo para modificar los datos del pago.

### Cambios

**`src/hooks/usePayments.ts`**
- Agregar `useUpdatePayment()` — mutación UPDATE sobre la tabla `payments`, recalcula status de factura (paid/partial/sent).

**`src/components/invoice-detail/EditPaymentDialog.tsx`** (nuevo)
- Diálogo con campos pre-poblados: fecha, monto, método, referencia, notas.
- Reutiliza el mismo diseño que `RecordPaymentDialog`.

**`src/components/invoice-detail/InvoicePaymentSummary.tsx`**
- Agregar columna "Acciones" con botón lápiz en cada fila.
- Estado local para pago seleccionado → abre `EditPaymentDialog`.
- Recibe `invoiceId` como prop nueva.

**`src/pages/InvoiceDetail.tsx`**
- Pasar `invoiceId` a `InvoicePaymentSummary`.

**`public/changelog.json`**
- Entrada v5.17.1: "Editar pagos registrados en facturas".

### Archivos
| Archivo | Acción |
|---------|--------|
| `src/hooks/usePayments.ts` | Agregar hook `useUpdatePayment` |
| `src/components/invoice-detail/EditPaymentDialog.tsx` | Crear |
| `src/components/invoice-detail/InvoicePaymentSummary.tsx` | Agregar columna acciones |
| `src/pages/InvoiceDetail.tsx` | Pasar prop `invoiceId` |
| `public/changelog.json` | Nueva entrada |

