
# Sprint DRY — Modales genéricos + Ecosistema de formularios

Alcance seleccionado: **C — barrido completo**. ~50 archivos tocados, dividido en 4 fases secuenciales para poder validar por lote.

## Diagnóstico previo

Infraestructura que **ya existe** y NO se reemplaza (se reutiliza):

- `FormDialog` + `FormDialogFooter` — modal shell agnóstico con `width: sm|md|lg|xl|2xl`, sticky header/footer, animaciones (Radix) y backdrop. Cumple lo solicitado como "Modal Base".
- `FormSection`, `FormActions`, `ConfirmDialog`, `SectionHeading`, `RequiredMark`, `InfoRow`.
- shadcn `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` (labels, focus y estados de error nativos).
- Primitivas: `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Label`.
- Selectors especializados: `CustomerSelector`, `SupplierSelector`, `ForkliftSelector`, `DatePickerField`, `DateRangePickerField`.

Gaps reales medidos:

- **24 dialogs** usan `DialogContent` crudo en lugar de `FormDialog`.
- **68 archivos** usan `<Input>` con `useState` local en vez de RHF + `<FormField>` (solo 19 lo hacen). Sin field-wrappers, cada campo repite ~7 líneas de boilerplate.
- No hay wrappers RHF sobre los selectors especializados (Customer/Supplier/Forklift) ni sobre fecha/moneda.

## Fase A — Ecosistema de campos (`src/components/forms/fields/`)

Un archivo por wrapper, cada uno < 60 LOC, genérico y tipado con `FieldValues`/`FieldPath` de RHF. Firma unificada: `{ control, name, label, description?, placeholder?, required?, disabled?, ...primitiveProps }`. Todos combinan internamente `FormField + FormItem + FormLabel + FormControl + FormMessage` + primitiva.

Set base:
- `TextField.tsx`
- `TextareaField.tsx` — con `rows` y contador opcional.
- `SelectField.tsx` — recibe `options: { value; label }[]` o children.
- `CheckboxField.tsx`
- `SwitchField.tsx`
- `NumberField.tsx` — inputMode numérico, min/max, coerción a `number|null`.

Fecha:
- `DateField.tsx` — wrapper RHF sobre `DatePickerField` (mantiene `pointer-events-auto`).
- `DateRangeField.tsx` — wrapper RHF sobre `DateRangePickerField`.

Moneda:
- `CurrencyField.tsx` — MXN por defecto (`formatCurrency` es-MX ya existente), prefijo `$`, sufijo configurable (`MXN`/`USD`), coerción a `number|null` en submit y toYMD/nn() según memoria de nullable.

Autocompletados (wrappers sobre selectors existentes, no reescribirlos):
- `CustomerField.tsx`
- `SupplierField.tsx`
- `ForkliftField.tsx`

Barrel: `src/components/forms/fields/index.ts` exporta todos.

## Fase B — Migración de 24 dialogs a `FormDialog`

Todos pasan de `<Dialog><DialogContent>…` a `<FormDialog title=… width=…>` para uniformar sticky header/footer, tamaños y microcopy.

Lote 1 (crm / fleet / audit — bajo riesgo):
`CloseWonDialog`, `CloseLostDialog`, `ProspectFormDialog`, `MarkAvailableDialog`, `DeleteAuditLogDialog`, `AuditLogDetailDialog`.

Lote 2 (bookings / deliveries / damage):
`PostBookingPolicyDialog`, `PostBookingDeliveryDialog`, `BookingActionDialogs`, `PostDeliveryPickupDialog`, `ReportDamageDialog`, `ImageGalleryLightbox` (mantener sin sticky header, sólo backdrop).

Lote 3 (invoices / quotes / returns / AP — más críticos):
`StampErrorDialog`, `CancelCfdiDialog`, `CancelCreditNoteDialog`, `EditReceptorFiscalDialog`, `PaymentIntentsSection` (dialog interno), `ValidateReceptorButton`, `RecurringInvoicesPreviewDialog`, `RecurringInvoicesResultDialog`, `EquipmentAssignmentDialog`, `QuoteConversionDialogs`, `ReturnInspectionDialog`, `SupplierBillFormDialog`.

## Fase C — Refactor de los 10 formularios más grandes con RHF + Zod + nuevos fields

Meta por archivo: reducción del 40-60% en LOC. Cada uno mantiene su schema Zod (crear si no existe) y usa `useForm` + `<Form>` + fields nuevos.

1. `SupplierBillFormDialog.tsx` (8 KB)
2. `InvoiceForm.tsx` (8 KB)
3. `ContractForm.tsx` (7 KB)
4. `SupplierFormFields.tsx` + `SupplierFormDialog.tsx` (6 KB c/u)
5. `RegisterSupplierPaymentDialog.tsx` (6 KB)
6. `QuoteForm.tsx` (6 KB)
7. `MaintenanceFormDialog.tsx` (5 KB)
8. `PartFormDialog.tsx` (5 KB)
9. `DeliveryFormFields.tsx` (5 KB)
10. `EditReceptorFiscalDialog.tsx` (5 KB) y `RecordPaymentDialog.tsx` (5 KB)

Regla dura por archivo migrado: sin `any`/`!`/`as`, cleanup de useEffect, sin prop drilling > 3 niveles, hooks ≤ 80 LOC, componentes ≤ 150 LOC (Power of 10).

## Fase D — Documentación y validación

- `mem://design/form-dialogs` actualizada con firma de cada field wrapper y microcopy.
- Reporte `/mnt/documents/refactor-dry/report.md` con métricas antes/después (LOC total, número de dialogs migrados, ejemplo por wrapper).
- Ejemplo antes/después para cada componente nuevo (basado en un campo real migrado).
- Changelog: entrada `minor` (creación de fields) + `patch` por cada lote de dialogs/forms.

## Detalles técnicos

- **Coerción de valores nullable**: usar `nn()` en el boundary del submit (memoria vigente); los defaults del RHF form son `""`/`false`/`undefined`, la conversión a `null` ocurre en `onSubmit`.
- **Fechas**: `toYMD()` para columnas `date`, `toISOString()` sólo para `timestamptz`.
- **Moneda**: `CurrencyField` almacena `number`, formatea en render con `formatCurrency` (es-MX).
- **Autocompletados**: no duplicar la lógica de `CustomerSelector`; el wrapper solo enlaza `field.value`/`field.onChange`.
- **Tamaños de `FormDialog`**: `sm` confirmaciones de una línea, `md` forms cortos (<6 campos), `lg` default, `xl` forms con múltiples secciones, `2xl` reservado para split-layouts (asignación de equipos).
- **Sin regresiones visuales**: cada lote se valida con capturas Playwright 1920×1080 vs baseline previa (usar convención `/mnt/documents/refactor-dry/{fase}/`).

## Riesgos

- Formularios con hooks caseros (`useCustomerFormLogic`) requieren revisión del contrato del hook. Se mantiene el hook si sólo cambian los JSX; se adapta si expone controlled inputs.
- `EquipmentAssignmentDialog` y `RecurringInvoicesPreviewDialog` tienen tablas internas con estado; su migración se limita al wrapper del modal, no al contenido tabular.
- `ImageGalleryLightbox` es un dialog no-form; se migrará a `FormDialog` con `width="2xl"` pero sin sticky footer.

## Entregables finales

- ~15 componentes nuevos en `src/components/forms/fields/` (+ barrel).
- 24 dialogs migrados a `FormDialog`.
- ~10 formularios reescritos con RHF+Zod+fields.
- Reporte con métricas de reducción y guía de uso.
- Memoria `mem://design/form-dialogs` actualizada.
- Changelog versionado por lote.
