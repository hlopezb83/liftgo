## Alcance restante del sprint DRY (Fase B)

Auditoría de lo pendiente:

**Dialogs sin migrar al shell `FormDialog`** (6):
- `damage/ImageGalleryLightbox.tsx`
- `invoices/StampErrorDialog.tsx`
- `invoices/invoice-detail/PaymentIntentsSection.tsx` (dialog inline)
- `invoices/invoice-detail/ValidateReceptorButton.tsx` (dialog inline)
- `invoices/recurring/RecurringInvoicesPreviewDialog.tsx`
- `invoices/recurring/RecurringInvoicesResultDialog.tsx`

**Formularios ya en `FormDialog` pero sin RHF+Zod / field-wrappers** (15):
- AP: `SupplierBillFormDialog`, `RegisterSupplierPaymentDialog`, `ExportPaymentsDialog`
- Suppliers: `SupplierFormDialog`, `SupplierContactFormDialog`, `SupplierBankAccountFormDialog`
- Customers: `CustomerFormDialog`, `CustomerInviteDialog`
- Inventory: `PartFormDialog`
- Deliveries: `DeliveryFormDialog`
- Bank reconciliation: `BankAccountFormDialog`
- Feedback: `FeedbackFormDialog`
- Invoices: `RecordPaymentDialog`, `CreateCreditNoteDialog`
- Portal: `ReportTransferDialog`

## Plan por lotes

### Lote 6 — Dialogs informativos/visuales de Invoices y Damage (v6.127.0)
- `StampErrorDialog`, `RecurringInvoicesPreviewDialog`, `RecurringInvoicesResultDialog` → migrar al shell `FormDialog` + `FormDialogFooter` (no llevan formulario, solo unificación visual).
- `PaymentIntentsSection` y `ValidateReceptorButton`: extraer los sub-dialogs inline al shell `FormDialog` conservando su lógica y toasts.
- `ImageGalleryLightbox`: no migrar (es un visor de imágenes con controles propios; no encaja en `FormDialog`). Documentar la excepción en el changelog.

### Lote 7 — Formularios de catálogo (Suppliers + Inventory) (v6.128.0)
- `SupplierFormDialog`, `SupplierContactFormDialog`, `SupplierBankAccountFormDialog`, `PartFormDialog`: reescritos con RHF + Zod y field-wrappers (`TextField`, `SelectField`, `TextareaField`, `NumberField`, `CurrencyField`, `CheckboxField`). Los hooks de mutación se preservan; se elimina el `useState` por campo y la validación manual.

### Lote 8 — Formularios de Customers y Portal (v6.129.0)
- `CustomerFormDialog`, `CustomerInviteDialog`, `ReportTransferDialog`, `FeedbackFormDialog`: migrados a RHF+Zod con field-wrappers. `CsfDropzone` y demás componentes de dominio quedan como children del form.

### Lote 9 — Formularios financieros pesados (AP + Invoices + Deliveries + Bank) (v6.130.0)
- `SupplierBillFormDialog`, `RegisterSupplierPaymentDialog`, `RecordPaymentDialog`, `CreateCreditNoteDialog`, `ExportPaymentsDialog`, `DeliveryFormDialog`, `BankAccountFormDialog`: reescritos sobre RHF+Zod con `CurrencyField`/`DateField`/`SupplierField`/`CustomerField`/`SelectField`/`TextareaField`. Estos son los más grandes (150–210 LOC); el diff neto esperado es −25% a −40% por archivo.

## Reglas transversales por lote

- Preservar la **firma pública** de cada componente; adaptar el caller sólo si el diálogo expone estado local que ya no aplica (como el caso previo de `SupplierPaymentRejectDialog`).
- Un schema Zod por archivo (o un archivo `lib/xxxSchema.ts` cuando el schema pese >30 líneas).
- `defaultValues` reseteados con `form.reset` en el efecto de `open` para edición limpia.
- CTA `disabled` derivado de `form.formState.isValid` + `mutation.isPending`.
- Cero llamadas nuevas a `useState<string>` para campos.
- Agregar entrada al `public/changelog.json` + `public/changelog/v{X.Y.Z}.json` al cierre de cada lote (minor por lote).

## Entregables

- 4 lotes secuenciales (v6.127.0 → v6.130.0).
- Reducción esperada: ≈ 800–1,200 LOC netas en total al terminar.
- Sin cambios de comportamiento visible; se preservan mensajes, toasts y flujos.
