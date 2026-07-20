## Auditoría Ola 3.6 — Verde ✅

- **Schema fix validado**: `superRefine` sólo valida bloque activo, bases laxas para partidas inactivas.
- **Tests**: 1104/1104 Vitest, 7 nuevos en `useQuoteFormLogic.test.tsx`.
- **Sin bugs residuales**, sin gaps de cobertura críticos.

---

## Ola 3.7 — UX-M2: SupplierBillFormDialog a RHF + Zod

Continuar la migración schema-first de formularios operativos. `SupplierBillFormDialog` (112 LOC, form crítico de cuentas por pagar) es el siguiente candidato natural: hoy usa `useState` disperso + validación imperativa, sin guard de cambios sin guardar.

### Alcance

1. **Schema Zod** (`src/features/accounts-payable/lib/supplierBillFormSchema.ts`):
   - `supplierId` requerido, `folio` requerido, `issueDate`/`dueDate` (dueDate ≥ issueDate), `subtotal ≥ 0`, `taxRate` ∈ {0, 8, 11, 16}, `total > 0`, `notes` opcional.
   - Inference de `SupplierBillFormValues`.

2. **Hook `useSupplierBillForm`** (`src/features/accounts-payable/hooks/useSupplierBillForm.ts`):
   - `useForm({ resolver: zodResolver(...), defaultValues })`.
   - Prefill vía `form.reset` cuando `existingBill` cambia (guard por id).
   - `handleSubmit` que invoca create/update mutation existente y hace `form.reset(values)` en `onSuccess`.

3. **Componente `SupplierBillFormDialog.tsx`**:
   - Migrar a `<Form>` + `<FormField>` + `<FormMessage>` inline (retirar toasts de validación).
   - Activar `useUnsavedChangesGuard(form.formState.isDirty && !isPending)`.
   - Remover `useState` locales para campos del form; mantener sólo state UI (dropzone open, etc).

4. **Tests**:
   - `supplierBillFormSchema.test.ts`: happy path, rechazo por dueDate < issueDate, total ≤ 0, taxRate fuera de catálogo, folio vacío.
   - `useSupplierBillForm.test.tsx` (integración): submit create, submit update, rechazo validación, cleanup isDirty post-submit, prefill de existingBill.

5. **Verificación**:
   - `bunx vitest run` — 1104 + ~10 nuevos.
   - `tsgo --noEmit` limpio.
   - Playwright: sin cambios visuales; smoke manual del flujo Crear/Editar bill.

6. **Changelog** v7.129.0 (minor).

### Fuera de alcance

- `ExpenseForm` (a la Ola 3.8 si aplica).
- `SupplierFormDialog`, `CustomerFormDialog`, `FeedbackFormDialog` (olas posteriores).
- Cambios de business logic en cuentas por pagar (sólo migración de forma).

### Detalles técnicos

- Reutilizar `useUnsavedChangesGuard` (ya probado en QuoteForm/ContractForm/InvoiceForm).
- Reutilizar patrón `useWatch` granular donde haya cálculos derivados (subtotal + tax → total).
- Seguir `mem://design/form-dialogs` (sticky header/footer, `Nuevo/Editar`, RequiredMark).
- Retirar cualquier `useEntityMutation` boilerplate no usado; mantener hooks canónicos.