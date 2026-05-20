# Fase 3 — Invoice migrado al stack canónico (react-hook-form + Zod)

Cierra la deuda §20.4 consolidando los **9 trozos de `useState`** del state bag de Invoice en un único `useForm<InvoiceFormValues>` con resolver Zod. Mismo patrón que Fases 1 (Customer) y 2 (Forklift), respetando Power of 10 (hooks ≤80 LOC, componentes ≤150 LOC, sin `any`/`!`/`as`, sin prop drilling >3 niveles).

## Alcance medido

| Archivo | LOC | Cambio |
|---|---|---|
| `useInvoiceFormState.ts` | 46 | **Eliminar** |
| `useInvoicePrefill.ts` | 120 | Reescribir → consume `form.reset` |
| `useInvoiceLineItemHandlers.ts` | 33 | Reescribir → `useFieldArray` |
| `useInvoiceFormSubmit.ts` | 64 | Refactor → `buildPayload(values)` |
| `useInvoiceFormLogic.ts` | 102 | Refactor → crea el `useForm`, expone `form` |
| `pages/InvoiceForm.tsx` | 118 | `<Form {...form}>` + `form.handleSubmit` |
| `CfdiFieldsCard.tsx` | 110 | `useFormContext` + `FormField` |
| `EditableLineItemsTable.tsx` | 92 | `useFormContext` + `useFieldArray` interno |
| `lib/schemas/invoiceFormSchema.ts` | nuevo | Esquema Zod (≤80 LOC) |

Tests internos del flujo: ninguno (`InvoicesPage.test.tsx` no toca el form).

## Pasos

### 1. Nuevo esquema `src/lib/schemas/invoiceFormSchema.ts`
```text
lineItemSchema: { description, quantity≥1, unit_price≥0, total, clave_prod_serv?, clave_unidad?, objeto_imp?, discount?, discount_type? }
cfdiSchema:     { serie, folio, formaPago, metodoPago, usoCfdi, moneda, tipoCambio≥0, receptorRfc, receptorRazonSocial, receptorRegimenFiscal, receptorDomicilioFiscalCp }
invoiceFormSchema: {
  bookingId: string,
  customerId: string.nullable(),
  customerName: string,
  lineItems: array(lineItemSchema).min(1, "Agrega al menos una partida"),
  taxRate: number≥0,
  issueDate: date,
  dueDate: date.optional(),
  notes: string,
  cfdi: cfdiSchema,
}
```
Tipo exportado: `InvoiceFormValues`. Defaults centralizados en `EMPTY_INVOICE_VALUES`.

### 2. `useInvoiceFormLogic` crea el `useForm`
- `useForm<InvoiceFormValues>({ resolver: zodResolver(invoiceFormSchema), defaultValues: EMPTY_INVOICE_VALUES })`.
- `useWatch({ control, name: ["lineItems","taxRate"] })` → `computeTotals` memoizado para `subtotal/taxAmount/total`.
- `handleCustomerSelect` / `handleBookingSelect` usan `form.setValue` por campo con `{ shouldDirty: true }`; el helper `applyCustomerCfdi` cambia a actualizar el sub-objeto `cfdi.*` vía `setValue("cfdi.receptorRfc", …)`.
- Expone `{ form, customers, availableBookings, onSubmit, handleCustomerSelect, handleBookingSelect, subtotal, taxAmount, total, isPending, isEdit, id, fromQuoteId, … }`.

### 3. `useInvoicePrefill` → un `reset` atómico por fuente
- Firma nueva: `useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form })`.
- `useEffect` (existing): construye `InvoiceFormValues` completo desde la factura existente + CFDI desde `customers` si falta, luego `form.reset(values)`.
- `useEffect` (sourceQuote, !isEdit): construye desde quote (con enriquecimiento de líneas para `sale`), luego `form.reset(values, { keepDirty: true })` para no pisar ediciones del usuario si ya tocó la pestaña.
- `applyCustomerCfdi` se vuelve helper puro `(customer) => Partial<CfdiFormValues>` y se compone en el reset/setValue del logic.

### 4. `useInvoiceLineItemHandlers` → `useFieldArray`
- Firma: `useInvoiceLineItemHandlers(form)`.
- `useFieldArray({ control: form.control, name: "lineItems" })` expone `append`/`remove`/`update`.
- `updateLineItem(idx, field, value)`: lee item actual con `form.getValues(\`lineItems.${idx}\`)`, recalcula `total` cuando `field` es `quantity`/`unit_price`, llama `update(idx, next)`.
- `addLineItem`: `append({ ...EMPTY_LINE })`.
- `removeLineItem`: `remove(idx)`.
- `handleCfdiUpdate(field, value)`: `form.setValue(\`cfdi.${field}\`, value, { shouldDirty: true })`. Caso especial `moneda === "MXN"` resetea `tipoCambio` a 1 en el mismo handler.

### 5. `useInvoiceFormSubmit` → `(values) => payload`
- `buildPayload(values: InvoiceFormValues, { isEdit, fromQuoteId, existingBookingId, existingQuoteId })` consume el shape canónico; sin dependencia de `useInvoiceFormState`.
- Mantiene `createInvoice` / `updateInvoice` / `updateQuote` y `isPending`.
- `onSubmit` invocado por `form.handleSubmit(onSubmit)` en el page: ejecuta `createInvoice`/`updateInvoice` y navega. El `toast.error("Agrega al menos una partida")` actual queda delegado a Zod (`<FormMessage>` en `EditableLineItemsTable`).

### 6. `pages/InvoiceForm.tsx`
- Envuelve con `<Form {...form}><form onSubmit={form.handleSubmit(onSubmit)}>`.
- Pasa `form` (o nada, vía contexto) a `CfdiFieldsCard` y `EditableLineItemsTable`.
- `Cliente`/`Reserva`/`Fecha…` migran a `FormField` con `form.control`; los selects con efecto colateral (`handleCustomerSelect`/`handleBookingSelect`) mantienen su callback pero leen `field.value` del contexto.
- `TotalsSummary.onTaxRateChange` → `(v) => form.setValue("taxRate", v, { shouldDirty: true })`. `taxRate` viene del `useWatch`.
- `NotesCard` reemplazado por `FormField name="notes"` + `Textarea` (mismo patrón aplicado en ForkliftForm Fase 2).

### 7. `CfdiFieldsCard.tsx`
- Sin props excepto opcional `disabled`. Usa `useFormContext<InvoiceFormValues>()` y `FormField name="cfdi.serie"`, etc.
- La regla "si moneda == MXN, fija tipoCambio=1" se encapsula en el `onValueChange` del `FormField` de `cfdi.moneda` con `form.setValue("cfdi.tipoCambio", 1)`.
- El campo `tipoCambio` se renderiza condicional al `useWatch("cfdi.moneda")`.

### 8. `EditableLineItemsTable.tsx`
- Recibe `disabled?` opcional. Internamente: `const { control } = useFormContext<InvoiceFormValues>(); const { fields, append, remove, update } = useFieldArray({ control, name: "lineItems" });`.
- Render por `fields[idx]` con `key={field.id}` (estable, evita re-mounts).
- Cada celda usa `FormField name={\`lineItems.${idx}.description\`}` etc. El total se calcula con `useWatch` por fila o se mantiene como cell derivada.
- Mensaje de "mínimo 1 partida" se muestra vía `<FormMessage />` raíz del array (`form.formState.errors.lineItems?.root?.message`).

## Detalles técnicos

- **Sin nuevos `any`/`!`/`as`**: tipos de `cfdi.*` se infieren del esquema; los handlers reciben uniones estrechas.
- **`unknown` en catches**: ya cumplido en submit; sin nuevos catches.
- **LOC**: `useInvoiceFormLogic` se divide si excede 80 LOC creando `useInvoiceTotals(form)` + `useInvoiceSelectHandlers(form, { customers, bookings, forklifts })`.
- **Prefill desde quote**: usar `reset(values, { keepDirty: true })` evita pisar ediciones cuando el usuario abre la página, edita, y luego el `sourceQuote` llega por refetch.
- **Compatibilidad PDF / detail**: solo cambia el flujo de captura; el payload final al RPC es idéntico (mismas columnas, mismos defaults). No tocar `InvoiceDocument` ni `useInvoices`.
- **Smoke test post-fase**: crear factura desde reserva, desde quote (sale con assignments), editar borrador, validar `tipoCambio` con USD, validar `<FormMessage>` al intentar guardar sin partidas, timbrar (`stamp-cfdi` consume el payload existente, sin cambios).

## Changelog

- `public/changelog.json`: nueva entrada `6.7.0` (minor, cierra deuda §20.4).
- `public/changelog/v6.7.0.json`: detalle con highlights de las tres fases consolidadas.

## Resultado esperado

- 0 usos restantes de "state bag" (`useState` orquestando 9 piezas) en formularios principales.
- Validación 100% por Zod + `<FormMessage>`; sin `toast.error` manuales por requeridos.
- Tabla de partidas reactiva vía `useFieldArray`, sin `useState` adicional.
- `subtotal/taxAmount/total` reactivos vía `useWatch` memoizado.
