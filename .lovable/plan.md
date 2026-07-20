# Auditoría Ola 3.5 — UX-M1 QuoteForm a RHF + Zod

## Verificación de la fase anterior

**Estado: verde con un gap de cobertura.**

Revisé schema (`quoteFormSchema.ts`), hook (`useQuoteForm.ts`, `useQuoteFormLogic.ts`), prefill (`useQuotePrefill.ts`), UI (`QuoteForm.tsx`), payload (`quoteFormPayload.ts`) y guard (`useUnsavedChangesGuard.ts`). Contra el plan original de Ola 3.5:

- **Schema fix aplicado correctamente**: `rentalLineSchema` acepta cualquier tarifa > 0 (fix del bug detectado en 3.4). Tests cubren dailyRate/weeklyRate/monthlyRate y rechazo con todas en 0.
- **RHF + Zod cableado**: `useForm({ resolver: zodResolver, mode: "onSubmit" })`, `useWatch` granular para totales, `useFieldArray` implícito vía `field.value/onChange` en los sub-componentes.
- **Guard activo y blindado**: `useUnsavedChangesGuard(isDirty && !isPending)` + `form.reset(prefillValues, { keepDirty: false })` en prefill + `form.reset(values)` post-mutación.
- **Prefill correcto**: guard por `hydratedId` evita pisar cambios del usuario si `existingQuote` cambia de referencia.

**Sin bugs de comportamiento.** Tres hallazgos menores y un gap:

1. **Gap real (paso 9 del plan de 3.5 no ejecutado)**: no existe `QuoteForm.test.tsx` de integración. No hay test que valide submit → mutate → `form.reset(values)` (guard cleanup), ni que `handleTypeChange` limpia líneas y rango.
2. **Cosmético `QuoteForm.tsx:53-55`**: `field.onChange(id)` seguido de `form.setValue("customerId", id, ...)` es duplicado — `field.onChange` ya escribe al form.
3. **Cosmético `useQuotePrefill.ts:129`**: re-export `defaultQuoteFormValues` sin consumidores.

Nada bloquea avanzar; el gap se cierra en 3.6.

---

## Plan Ola 3.6 — Cobertura QuoteForm + siguiente hito de auditoría

### Parte A — Cerrar gap de cobertura Ola 3.5

1. **`useQuoteFormLogic.test.tsx` (nuevo)** — `renderHook` con `MemoryRouter` + `QueryClientProvider` y mocks de `useCustomers`/`useEquipmentModels`/`useQuote`/`useNextQuoteNumber`/`useCreateQuote`/`useUpdateQuote`:
   - Submit sin cliente → `createQuote.mutate` no se llama; `form.formState.errors.customerId` presente.
   - Submit renta sin dateRange → mutate no se llama; error en `dateRange`.
   - Submit renta con partida sin ninguna tarifa > 0 → error en `rentalLines.0.monthlyRate`.
   - Submit renta válida → `createQuote.mutate` recibe payload con `line_items`, `subtotal/tax/total` correctos, `rental_meta` poblado, `quote_type='rental'`.
   - Submit venta válida → `rental_meta=null`, `quote_type='sale'`.
   - **Post-mutación**: tras `onSuccess`, `form.formState.isDirty === false` (blindaje del guard, evita race con `navigate`).
   - **`handleTypeChange`**: cambiar de `rental` a `sale` deja `dateRange=undefined`, `rentalLines=[EMPTY]`, `saleLines=[EMPTY]`, `includeLogistics=false`, `logisticsCost=0`.

2. **`QuoteForm.tsx` micro-fixes**:
   - Eliminar `form.setValue("customerId", ...)` redundante tras `field.onChange(id)`.
   - Mantener `form.setValue("customerName", ...)` en `onCustomerNameChange` (no viene del mismo `field`).

3. **`useQuotePrefill.ts`**: retirar `export { defaultQuoteFormValues }` sin consumidores (import directo desde `useQuoteForm.ts`).

### Parte B — Siguiente hito de la auditoría integral

Continuar con el siguiente ticket **UX-M** o **EC-A** del backlog `liftgo-auditoria-integral.md`. Los formularios grandes ya migrados a RHF+Zod+Guard son: `InvoiceForm`, `ContractForm`, `QuoteForm`. El siguiente candidato natural del backlog UX-M es **`ExpenseForm` / `SupplierInvoiceForm`** (formularios de captura que hoy usan `useState` múltiple y `notifyValidation`).

Pregunta al usuario al llegar aquí para no invadir alcance: ¿migrar `ExpenseForm` (más pequeño, ~120 LOC) o `SupplierInvoiceForm` (más impacto, gestiona XML+PDF+RLS)?

### Verificación

- `bunx tsgo --noEmit` limpio.
- `bunx vitest run` — nueva cobertura debe sumar ≥ 7 tests a `useQuoteFormLogic`. Meta: 1104+/1104+ verde.
- Playwright: sin cambios visuales, no requiere regenerar baselines.

### Fuera de alcance

- Rediseño visual, cambios en `RentalLineItems`/`SaleLineItems`, o refactor de `EquipmentAssignmentDialog` (no tocados por 3.5).
- Cambios en `useUnsavedChangesGuard` (funciona correctamente).

### Detalles técnicos

- Mocks: `vi.mock("../hooks/quotes/useQuotes")`, `vi.mock("@/features/customers")`, `vi.mock("@/features/fleet")`. `useCreateQuote` retorna `{ mutate: vi.fn((_, opts) => opts?.onSuccess?.()), isPending: false }` para simular ciclo completo.
- Assertion de `isDirty=false` post-submit se hace tras `await waitFor(() => expect(createQuote.mutate).toHaveBeenCalled())` y verificando `result.current.form.formState.isDirty`.
- El test de `handleTypeChange` corre `act(() => result.current.handleTypeChange("sale"))` y valida `form.getValues()`.

### Changelog

- `public/changelog.json` + `public/changelog/v7.128.0.json` (patch → minor por nueva cobertura de test crítica del guard).
