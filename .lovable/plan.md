## Auditoría Ola 3.4

**Estado verde:** 1112/1112 Vitest, typecheck limpio, EC-A4 consolidado.

**Un hallazgo importante en el fundamento del schema** (crítico blindar antes de migrar la UI):

- `quoteFormSchema` exige `monthlyRate > 0` en cada partida de renta, pero la validación real del app (`quoteFormValidation.ts`) acepta `dailyRate > 0 || weeklyRate > 0 || monthlyRate > 0` (basta una tarifa activa). Si migramos la UI sin ajustar, romperemos cotizaciones legítimas de renta diaria/semanal.

**Hallazgos menores:**
- `.refine(v => v.length > 0, ...)` en `nonEmptyId` es redundante frente a `.min(1)` — puro ruido.
- `dateRangeSchema.optional()` combinado con `superRefine` funciona, pero es más legible con `z.object` no-opcional + refine.
- Faltan casos de test: `taxRate` inválido ("abc") y "logística desmarcada con `logisticsCost > 0` sigue siendo válido" (evita falsos positivos futuros).

Todos son de bajo riesgo y se corrigen dentro de Ola 3.5 (donde el schema se vuelve fuente de verdad de la UI).

**Superficie confirmada de QuoteForm (para dimensionar 3.5):**
- `QuoteForm.tsx` (142) + `useQuoteFormLogic.ts` (~85) + `useQuoteFormState.ts` (47) + `useQuotePrefill.ts` (31).
- Sub-formularios: `RentalLineItems`/`RentalLineRow` (87+94), `SaleLineItems`/`SaleLineRow` (63+111).
- Helpers puros ya extraídos: `quoteFormBuilders`, `quoteFormHelpers`, `quoteFormPayload`, `quoteFormPrefillHelpers`, `quoteFormValidation` (con sus tests — 5 archivos).

---

## Plan Ola 3.5 — UX-M1: QuoteForm a RHF + Zod

### Objetivo
Migrar `QuoteForm` a React Hook Form + `zodResolver(quoteFormSchema)`, sin cambiar semántica de mutaciones ni layout. La validación pasa de `notifyValidation` (toasts) a `FormMessage` inline, con `useUnsavedChangesGuard` activado.

### A) Ajustes de schema (fix del hallazgo de 3.4)

1. `quoteFormSchema.ts`:
   - `rentalLineSchema`: relajar tarifas — `dailyRate`/`weeklyRate`/`monthlyRate` como `nonNegative`, y agregar refine "al menos una tarifa > 0" a nivel línea.
   - Quitar `.refine` redundante en `nonEmptyId`.
   - Normalizar `dateRangeSchema` a `z.object({from, to}).partial()` + refine en `superRefine`.
2. `quoteFormSchema.test.ts`: actualizar casos afectados y agregar 3 tests nuevos:
   - Válido: renta con sólo `dailyRate > 0`.
   - Válido: renta con sólo `weeklyRate > 0`.
   - Rechazo: partida renta con todas las tarifas en 0.
   - Rechazo: `taxRate = "abc"`.
   - Válido: `includeLogistics=false` con `logisticsCost > 0` (no debe bloquear).

### B) Migración de UI + lógica

3. `src/features/quotes/hooks/quoteForm/useQuoteForm.ts` (nuevo — reemplaza `useQuoteFormState`):
   - `useForm<QuoteFormValues>({ resolver: zodResolver(quoteFormSchema), defaultValues })`.
   - Exporta el `UseFormReturn` + arrays de field para rental/sale (via `useFieldArray`).

4. `useQuoteFormLogic.ts`:
   - Adopta `useQuoteForm`. Prefill vía `form.reset(prefillValues, { keepDirty: false })`.
   - `handleSubmit` = `form.handleSubmit(async (values) => { ... buildQuotePayload(values) ... })`.
   - Elimina llamada a `validateQuoteForm` (ahora vive en el resolver).
   - Deriva `startDate`/`endDate`/`lineItems`/`totals` con `useWatch` sobre los campos relevantes (evita re-renders globales del form).
   - Cablea `useUnsavedChangesGuard(form.formState.isDirty)`.

5. `QuoteForm.tsx`:
   - Envuelve con `<Form {...form}>` (patrón shadcn).
   - Cada campo escalar (`customerId`, `currency`, `taxRate`, `validUntil`, `notes`, `includeLogistics`, `logisticsCost`) usa `<FormField control={form.control} name="..."` con `<FormItem>/<FormLabel>/<FormControl>/<FormMessage>`.
   - `dateRange` y `validUntil` usan `Controller` (los pickers no son inputs nativos).
   - `Tabs` `quoteType` mantiene el reset de líneas: implementado como `form.reset({ ...current, quoteType, rentalLines:[EMPTY], saleLines:[EMPTY], dateRange:undefined, includeLogistics:false, logisticsCost:0 }, { keepDirty:true })`.

6. `RentalLineItems.tsx` + `SaleLineItems.tsx`:
   - Reciben `control` (o el `UseFieldArrayReturn`) en lugar de `lines`/`onChange`.
   - Cada fila hace `<FormField>` por celda o consume `useFormContext` internamente (elegimos passthrough de `control` + `name` prefijado para menor acoplamiento).

7. `useQuotePrefill.ts`:
   - Cambia firma a `useQuotePrefill({ existingQuote, equipmentModels, form })`.
   - Usa `form.reset(prefillFromQuote(existingQuote, equipmentModels), { keepDirty: false })` una sola vez cuando la cotización llega (dep guard con `existingQuote?.id`).

8. `quoteFormHelpers.ts` y `quoteFormValidation.ts`:
   - Se retira `validateQuoteForm` (ahora es el resolver).
   - `quoteFormValidation.test.ts` se retira o se re-orienta a casos de schema (los mismos casos ya cubiertos por `quoteFormSchema.test.ts` — se elimina el archivo).
   - `buildSaleItems`/`buildRentalItems`/`buildQuotePayload` intactos (sólo cambia el shape de entrada, ya coincide).

### C) Tests

9. `src/features/quotes/pages/__tests__/QuoteForm.test.tsx` (nuevo):
   - Render dentro de `MemoryRouter` + `QueryClient` mock, mocks de `useCustomers`/`useEquipmentModels`/mutaciones.
   - Submit sin cliente → aparece `FormMessage` "Requerido" en el campo Cliente y `createQuote.mutate` no se llama.
   - Submit modo renta sin rango → `FormMessage` en `dateRange` y no se dispara mutación.
   - Submit modo renta con partida sin ninguna tarifa > 0 → error visible en la línea.
   - Submit válido (renta con rango y monthlyRate) → `createQuote.mutate` recibe el payload esperado con `line_items`/`totals`/`rental_meta` correctos.
   - Submit válido (venta con unitPrice) → mutación con `quote_type='sale'` y `rental_meta=null`.

10. `src/features/quotes/hooks/quoteForm/__tests__/useQuotePrefill.test.tsx` (nuevo):
    - Prefill de cotización existente NO marca `isDirty` (blindaje del guard).
    - Un `existingQuote` que llega tarde dispara el reset una sola vez.

### Detalles técnicos

- Los sub-componentes `RentalLineRow`/`SaleLineRow` mantienen su lógica actual pero ahora exponen `control` y `namePrefix` (patrón `useFieldArray`).
- `useFieldArray` se usa en los dos arrays (`rentalLines`, `saleLines`) para add/remove/replace consistentes con RHF.
- `useWatch` con `name` específico en `useQuoteFormLogic` para totales — evita `form.watch()` global que dispararía re-render de todo el form.
- Mocks de tests: `useCustomers`/`useEquipmentModels`/`useQuote`/`useNextQuoteNumber` con `vi.mock` de `../hooks/quotes/useQuotes` y `@/features/customers`/`@/features/fleet`.

### Fuera de alcance
- Cambios visuales en tarjetas/spacing.
- Refactor de `EquipmentAssignmentDialog`, `AssignForkliftsCard` o el flujo de conversión (se abordarán en su propio sprint si sale del audit).
- Nueva funcionalidad — sólo migración.

### Verificación
- `bunx tsgo --noEmit` limpio.
- `bunx vitest run` — `1112 → ~1128` (aprox +18: 5 schema, 6 QuoteForm, 2 prefill, ajustes en tests existentes; menos los ~5 de `quoteFormValidation.test.ts` retirados).
- Prueba manual en preview: nueva cotización renta, nueva venta, edición de existente, cancel con cambios (guard debe advertir), cancel sin cambios (no advierte).
- Entrada nueva `public/changelog.json` + `public/changelog/v7.127.0.json`.
