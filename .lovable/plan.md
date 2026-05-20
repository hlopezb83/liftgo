# Plan: migrar los 3 "state bags" restantes a react-hook-form + Zod

Cerramos la deuda de §20.4 (stack canónico de formularios) sin violar Power of 10: cada fase ≤150 LOC por componente, ≤80 LOC por hook, sin prop drilling >3 niveles, y un PR atómico por fase con su entrada de changelog.

## Contexto medido


| Target                                        | LOC actuales | Hijos / consumidores                                                                                                                                            | Riesgo                                                                                |
| --------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CustomerFormDialog` + `CustomerFormSections` | 104 + 108    | 4 secciones que consumen `form/set`                                                                                                                             | Bajo (puro UI)                                                                        |
| `useInvoiceFormState`                         | 46           | `useInvoicePrefill`, `useInvoiceLineItemHandlers`, `useInvoiceFormSubmit`, `useInvoiceFormLogic`, `InvoiceForm.tsx`, `CfdiFieldsCard`, `EditableLineItemsTable` | Alto (9 piezas de estado, prefill desde quote/booking/customer)                       |
| `useForkliftFormState`                        | 46           | `useForkliftPrefill`, `useForkliftFormSubmit`, `useForkliftFormLogic`, `ForkliftForm.tsx`, 3 secciones                                                          | Medio (estado derivado: manufacturers/filteredModels dependen de `form.manufacturer`) |


## Fase 1 — Customer (bajo riesgo, valida el patrón)

**Alcance**: `CustomerFormDialog.tsx` + `CustomerFormSections.tsx` + `CsfDropzone` (sólo consumidor de `onParsed`).

**Cambios**:

1. `CustomerFormDialog` adopta `useForm<CustomerFormData>({ resolver: zodResolver(customerFormSchema), defaultValues: emptyCustomer })`.
2. Envolver el form en `<Form {...form}>` y reemplazar `handleSubmit` manual por `form.handleSubmit(onSubmit)`. Quitar el `toast.error` manual (RHF + zodResolver emite errores por campo vía `FormMessage`).
3. Reemplazar la firma `{ form, set }` de las 4 secciones por `useFormContext<CustomerFormData>()` + `FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage`. Mantiene la estructura visual (Identidad/Fiscal/Contacto/Dirección).
4. `handleCsfParsed` → `form.reset({ ...form.getValues(), ...patch })` filtrando vacíos.
5. Effect `[open]` → `form.reset(initialData ? { ...emptyCustomer, ...initialData } : emptyCustomer)`.

**Salida**: ~5 archivos tocados, sin nuevos LOC netos. Changelog `v6.7.0-alpha.1`.

## Fase 2 — Forklift (riesgo medio, valida estado derivado)

**Alcance**: `useForkliftFormState`, `useForkliftFormLogic`, `useForkliftPrefill`, `useForkliftFormSubmit`, `ForkliftForm.tsx`, secciones `EquipmentDetailsSection`/`InsuranceSection`/`RatesSection`.

**Cambios**:

1. Crear `forkliftFormSchema` en `lib/formSchemas` (ya parcialmente existe vía `ForkliftFormData`). Confirmar tipo.
2. `useForkliftFormState` se reduce a derivados puros: recibe `form: UseFormReturn<ForkliftFormData>` y devuelve `{ hasModels, manufacturers, filteredModels }`. El `useState`/`set` desaparecen. Mantener `useMemo` con dependencia `form.watch("manufacturer")`.
3. `useForkliftFormLogic` crea el `useForm` y pasa el control. `handleManufacturerChange`/`handleModelChange` usan `form.setValue` con `shouldDirty: true`.
4. `useForkliftPrefill` cambia firma a `(existing, form.reset)` — un solo `reset` atómico cuando `existing` llega.
5. `useForkliftFormSubmit` lee `form.getValues()` en lugar de recibir `form` plano. Validación delegada al resolver.
6. Secciones migran a `useFormContext` + `FormField`. Selectores Manufacturer/Model siguen recibiendo `manufacturers`/`filteredModels` como prop (datos derivados, no estado).

**Validación post-fase**: crear forklift nuevo, editar uno existente, cambiar manufacturer y verificar reset de `model`, autopoblado de capacidad/altura/combustible desde `equipment_models`.

**Salida**: Changelog `v6.7.0-alpha.2`.

## Fase 3 — Invoice (riesgo alto, fase final)

**Alcance**: 4 hooks bajo `invoiceForm/`, `useInvoiceFormLogic`, `InvoiceForm.tsx`, `CfdiFieldsCard`, `EditableLineItemsTable`.

**Estrategia**: consolidar los 9 trozos de estado en **un solo** `useForm<InvoiceFormValues>` con esquema Zod nuevo:

```ts
const invoiceFormSchema = z.object({
  bookingId: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().min(1),
  lineItems: z.array(lineItemSchema).min(1),
  taxRate: z.number().min(0).max(100),
  issueDate: z.date(),
  dueDate: z.date().optional(),
  notes: z.string(),
  cfdi: cfdiSchema, // serie, folio, formaPago, metodoPago, usoCfdi, moneda, tipoCambio, receptor*
});
```

**Cambios**:

1. Nuevo `lib/schemas/invoiceSchema.ts` (≤80 LOC).
2. `useInvoiceFormState` se elimina. `useInvoiceFormLogic` crea el `useForm`.
3. `useInvoicePrefill` recibe `form.reset`; consolida prefill desde `existing | sourceQuote | booking` en un único `reset` por fuente — elimina los `setX` encadenados actuales.
4. `useInvoiceLineItemHandlers` opera sobre `form.setValue("lineItems", ...)` con `useFieldArray` si simplifica add/remove/edit.
5. `handleCustomerSelect`/`handleBookingSelect` usan `form.setValue` agrupando con `{ shouldDirty: true }`.
6. `useInvoiceFormSubmit.buildPayload` consume `form.getValues()`.
7. `computeTotals` se mueve a un `useWatch(["lineItems","taxRate"])` memoizado en `useInvoiceFormLogic` para mantener reactividad de `subtotal/taxAmount/total`.
8. `CfdiFieldsCard` migra a `FormField` con `useFormContext`. `EditableLineItemsTable` recibe `control` o usa `useFieldArray` interno.

**Riesgos a vigilar**:

- Prefill desde quote dispara `reset` después de fetch: garantizar que no pisa cambios del usuario (`reset(values, { keepDirty: true })` si la pestaña fue editada).
- `tipoCambio` debe re-disparar cálculo de totales si moneda ≠ MXN (mantener lógica actual).
- Verificar que el `useFieldArray` no fuerce re-mount de `EditableLineItemsTable` al editar filas.

**Salida**: Changelog `v6.7.0` (cierra deuda §20.4).

## Criterios Power of 10 por fase

- Cada fase termina con `wc -l` de cada archivo tocado ≤150 (componentes) / ≤80 (hooks). Si Invoice excede, dividir `useInvoiceFormLogic` en `useInvoicePrefillEffects` + `useInvoiceTotals`.
- Cero `any`/`!`/`as` introducidos. `unknown` en catches.
- Cero prop drilling >3 niveles (gracias a `useFormContext`).
- Entrada en `public/changelog.json` + detalle `public/changelog/v6.7.0-alpha.X.json` al final de cada fase.

## Validación entre fases

Al cerrar cada fase, smoke test en preview:

- Customer: crear + importar CSF + editar.
- Forklift: crear con/sin modelos, editar, cambiar manufacturer.
- Invoice: crear desde booking, desde quote, editar borrador, timbrar.

## Decisión a confirmar

¿Empiezo por **Fase 1 (Customer)** para validar el patrón canónico antes de tocar Invoice, o prefieres atacar primero **Forklift** (riesgo medio, también valida estado derivado con menos blast radius que Invoice)? Empieza por Fase 1