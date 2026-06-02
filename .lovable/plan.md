# Plan: Cancelación CFDI + Complementos de Pago

Investigué Facturapi y el código actual. Hay 2 trabajos: **arreglar** la cancelación (tiene bugs) y **construir** el flujo de Complementos de Pago (REP) desde cero.

---

## Parte 1 — Cancelación de facturas (fix + mejoras)

### Bugs detectados en `cancel-cfdi`

1. La edge function ignora el motivo seleccionado en la UI y siempre manda `motive: "02"` hardcodeado.
2. El parámetro va en el body, pero Facturapi lo espera como **query string**: `DELETE /v2/invoices/:id?motive=02`.
3. No se guarda el `cancellation_status` real del SAT (`pending` / `accepted` / `rejected`). Hoy se marca como `cancelled` de inmediato aunque el SAT siga pendiente.
4. No existe soporte para motivo **01** (que requiere UUID de la factura sustituta).

### Cambios

**DB** — nueva migración:

- `invoices.cancellation_status` (`none` | `pending` | `accepted` | `rejected` | `expired`, default `none`)
- `invoices.cancellation_motive` (`01` | `02` | `03` | `04`)
- `invoices.substitution_uuid` (uuid, sólo para motivo 01)

**Edge function `cancel-cfdi`:**

- Recibir `motive` (código SAT) y `substitution_uuid` opcional.
- Validar: motivo 01 ⇒ requiere `substitution_uuid`.
- Llamar `DELETE /v2/invoices/{id}?motive=XX[&substitution=UUID]`.
- Leer `cancellation_status` de la respuesta y guardarlo. Sólo marcar `cfdi_status = 'cancelled'` cuando SAT responde `accepted`; si es `pending`, dejar la factura visible con badge "Cancelación pendiente SAT".

**Nueva edge function `refresh-cancellation-status`:**

- Llama `PUT /v2/invoices/{id}/status` para que Facturapi re-consulte al SAT.
- Actualiza `cancellation_status` y, si pasa a `accepted`, marca la factura como cancelada.

**UI:**

- `CancelCfdiDialog.tsx`: cuando el usuario elige motivo **01**, mostrar un input para el UUID de la factura sustituta (validar formato uuid).
- `InvoiceDetail`: cuando `cancellation_status = 'pending'`, mostrar badge ámbar "Cancelación pendiente SAT" + botón "Actualizar estado SAT" que llama a la nueva edge function.
- `StatusBadge`: agregar variante para `pending` / `rejected`.

---

## Parte 2 — Complementos de Pago (REP) — nuevo

### Reglas SAT relevantes

- Facturas **PUE**: el pago ya está cobrado, **nunca** llevan REP.
- Facturas **PPD**: el `payment_form` se emite como `99 - Por Definir` y **cada cobro** requiere un Complemento de Pago timbrado (CFDI tipo `P`).
- Endpoint: mismo `POST /v2/invoices` con `type: "P"` y `complements[{ type: "pago", data: [...] }]`.

### DB — extender `payments`

- `installment_number` (int) — número de parcialidad (1, 2, 3…)
- `prior_balance` (numeric) — saldo insoluto **antes** de este pago
- `payment_form_sat` (text) — código SAT (`03` transferencia, `28` tarjeta, etc.)
- `currency` (text, default `MXN`) y `exchange_rate` (numeric, default 1)
- `rep_facturapi_id`, `rep_cfdi_uuid`, `rep_cfdi_status` (`pending` | `stamped` | `cancelled`)
- `rep_xml_url`, `rep_pdf_url` (paths en bucket `cfdi-files`)

### Nueva edge function `stamp-payment-complement`

Input: `{ payment_id }`
Flujo:

1. Cargar `payment` + `invoice` + `customer`. Validar que invoice `metodo_pago = 'PPD'` y esté timbrada (`cfdi_uuid` presente).
2. Calcular `prior_balance` = total − suma de pagos previos. Validar `amount ≤ prior_balance`.
3. Calcular desglose de IVA 16% (base = amount / 1.16). Para tasas mixtas/IEPS queda fuera del MVP (todas las facturas LiftGo usan 16% — confirmar).
4. POST a Facturapi con payload `type: "P"`, customer del cliente, y `complements[].data[]` con `related_documents[]` apuntando al `cfdi_uuid` de la factura original.
5. Descargar XML + PDF del REP y subirlos a `cfdi-files/{invoice_id}/rep-{rep_uuid}.{xml,pdf}` (mismo bucket).
6. Guardar `rep_facturapi_id`, `rep_cfdi_uuid`, `rep_cfdi_status='stamped'`, URLs, en `payments`.

### Nueva edge function `cancel-payment-complement` (mismo patrón que `cancel-cfdi`)

Para cancelar un REP si fue emitido por error.

### Edge function `download-cfdi` — extender

Aceptar `payment_id` además de `invoice_id` para servir XML/PDF del REP desde Storage.

### UI

- `**RecordPaymentDialog**`: cuando la factura es PPD y está timbrada, agregar:
  - Selector "Forma de pago SAT" (catálogo: 01, 02, 03, 04, 28, 99…)
  - Selector moneda + tipo de cambio (default MXN/1)
  - Checkbox "Timbrar Complemento de Pago" (default ON para PPD timbradas)
- `**InvoicePaymentSummary` / lista de pagos**: nueva columna "REP" con badge (sin timbrar / timbrado / cancelado) y botones:
  - "Timbrar REP" si está pendiente
  - "Descargar XML / PDF" si está timbrado
  - "Cancelar REP" si está timbrado
- `**InvoiceDetailActions**`: badge global "Saldo pendiente $X — N pagos sin REP" para facturas PPD con cobros sin complementar.

---

## Archivos afectados

**Migraciones:**

- Nueva migración: columnas en `invoices` y `payments`.

**Edge functions:**

- `supabase/functions/cancel-cfdi/index.ts` — fix motive + status real
- `supabase/functions/refresh-cancellation-status/index.ts` — nueva
- `supabase/functions/stamp-payment-complement/index.ts` — nueva
- `supabase/functions/cancel-payment-complement/index.ts` — nueva
- `supabase/functions/download-cfdi/index.ts` — soporte para REP
- `supabase/config.toml` — registrar las 3 nuevas funciones

**Frontend:**

- `src/features/invoices/components/invoice-detail/CancelCfdiDialog.tsx` — input UUID sustitución
- `src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx` — badges + acciones REP
- `src/features/invoices/components/invoice-detail/InvoicePaymentSummary.tsx` (o equivalente) — columna REP por pago
- `src/features/invoices/components/payments/RecordPaymentDialog.tsx` — forma de pago SAT + checkbox REP
- `src/lib/domain/satCatalogs.ts` — agregar catálogo de formas de pago SAT si no existe
- Nuevo hook `useStampPaymentComplement` y `useCancelPaymentComplement`

**Changelog:**

- `v6.18.0` (minor) — "Cancelación CFDI con motivos completos + Complementos de Pago (REP)"

---

## Preguntas abiertas antes de implementar

1. **Alcance del IVA**: ¿confirmas que todas las facturas LiftGo siempre usan IVA 16% único? Si hay mezcla (16% + 0% + exento) o IEPS, el cálculo del desglose en REP se complica. Hoy solo se usa el 16% de iva. 
2. **¿Implemento las 2 partes (cancelación + REP) en un solo entregable, o prefieres dividir?** Cancelación es ~30% del trabajo, REP ~70%. Implementa todo
3. **Webhook de Facturapi** para `cancellation_status` actualizada automáticamente: ¿lo incluyo o por ahora basta con el botón manual "Actualizar estado SAT"? usa la mejor práctica. 