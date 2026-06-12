# Auditoría de arquitectura — LiftGo

## Resumen ejecutivo

La base está **sana**. Métricas globales:
- Ningún archivo de aplicación supera **360 LOC** (excluyendo `supabase/types.ts` autogenerado y `components/ui/*` de shadcn). Sólo 2 archivos pasan de 250.
- **0** llamadas directas a `supabase` en `pages/` o `components/` de features (todo pasa por hooks).
- **3** TODO/FIXME, **1** `as any`, **4** `console.*` en código de producción. Excelente higiene.
- 28 features con estructura uniforme `pages/ components/ hooks/ lib/`.

Los problemas restantes son de **organización fina y consistencia**, no de deuda crítica.

---

## Hallazgos por severidad

### ALTO

**1. Query keys inconsistentes y sin invalidaciones jerárquicas** — `src/features/**/hooks/**`
- 18 ocurrencias de `["invoices"]`, 13 de `["forklifts"]`, 8 de `["bookings"]`, etc., como strings literales repetidos.
- Ya se crearon factories en `src/features/{invoices,bookings,fleet,customers,crm}/lib/queryKeys.ts` (v6.47.0) pero **ningún hook los está usando todavía**.
- Riesgo: invalidaciones que olvidan keys hermanas → datos rancios en UI tras mutaciones.

**2. Schemas Zod dentro de componentes UI** — acoplamiento de validación con render
- `features/deliveries/components/deliveries/DeliveryFormDialog.tsx`
- `features/operations/components/operations/FiscalDataTab.tsx`
- `features/operations/components/operations/CompanyLogoTab.tsx`
- `features/accounts-payable/components/RegisterSupplierPaymentDialog.tsx`
- `features/returns/hooks/returnInspection/useReturnInspectionDialog.ts`
- El resto del proyecto ya sigue el patrón `features/*/lib/*FormSchema.ts`. Estos 5 rompen separación de capas y no son reutilizables/testeables.

**3. Acoplamiento cross-feature por imports profundos** — sin barrels públicos
- 78 imports cruzados a `@/features/fleet/(hooks|lib|components)/...`, 68 a `invoices`, 58 a `crm`, 55 a `users` y `customers`.
- No existe ningún `src/features/*/index.ts`. El lint guardrail añadido en v6.47.0 está en **warning**, no en error, y no tiene barrels a los que apuntar.
- Riesgo: cualquier rename interno rompe consumidores remotos; imposible saber qué es API pública de un feature.

### MEDIO

**4. Nesting redundante en hooks** — `features/X/hooks/X/...`
- `features/invoices/hooks/invoices/` (13 hooks), `features/fleet/hooks/fleet/`, `features/bookings/hooks/bookingDetail/`, `bookingForm/`, etc.
- Mezcla: algunos hooks viven al nivel `hooks/` (p.ej. `useBookings.ts`, `usePayments.ts`) y otros en subcarpetas temáticas. No hay regla.
- Sugerencia: subcarpetas **por tema funcional** (`cfdi/`, `payments/`, `recurring/`, `pdf/` para invoices) y eliminar la subcarpeta espejo del nombre del feature.

**5. Carpeta `hooks/invoices/` mezcla 4 dominios distintos**
`useCancelCfdi`, `useStampCfdi`, `useRefreshCancellationStatus`, `usePaymentComplement` (CFDI) conviven con `useCollectionNotes`, `useGenerateRecurringInvoices`, `useInvoicePdfDownload`, `useUpcomingInvoices`. Reagrupar.

**6. Hooks "Logic" como God-hooks delgados**
`useInvoiceFormLogic.ts`, `useBookingActionsLogic.ts`, `useForkliftFormLogic.ts`, `useContractFormPrefill.ts`. El sufijo "Logic" suele esconder orquestación que mezcla submit + fetch + navegación + toast. Revisar uno por uno y separar en (a) form state, (b) submit mutation, (c) side-effects.

**7. Patrones repetidos de "lista paginada"** sin hook genérico
Cada `*Page.tsx` (invoices, bookings, customers, suppliers, fleet, quotes, contracts…) instancia manualmente `useListPage` + `useListFilters` + `useSort` + `usePagination` + `MobileCardList`. Existe ya scaffolding (`ListPageLayout.tsx`, 251 LOC, el archivo más grande de la app) pero falta un `useResourceList<T>` que envuelva el quinteto.

### BAJO / OPCIONAL

**8. `src/components/` mezcla primitivos genéricos y compuestos de dominio**
22 archivos sueltos: hay layout (`ListPageLayout`, `PageHeader`, `DetailPageHeader`, `FormPageHeader`), inputs (`DatePickerField`, `SearchBar`), feedback (`EmptyState`, `TableSkeleton`, `StatusBadge`) y dominio (`ReadOnlyLineItemsTable`, `TotalsSummary`, `NotesCard`). Mover a subcarpetas `layout/`, `forms/`, `feedback/`, `domain/`.

**9. `src/lib/` raíz tiene 14 ficheros + 9 subcarpetas mezclados**
`coerce.ts`, `config.ts`, `constants.ts`, `money.ts`, `formatCurrency.ts`, `rpc.ts`, `routes-config.tsx`, `routes.ts`, `telemetry.ts`, `utils.ts`, `exportCsv.ts`. `formatCurrency.ts` debería vivir bajo `lib/money/` o `lib/format/`. `routes-config.tsx` y `routes.ts` deberían moverse a `src/app/routes/`.

**10. PDFs gigantes en `lib/pdf/theme/styles.ts`** (360 LOC)
El archivo más grande de la app (sin contar autogenerados). Considerar dividir por documento (invoice styles, quote styles, statement styles).

**11. Cobertura de tests desbalanceada**
Sólo carpetas con `__tests__`: `bookings/hooks`, `invoices/hooks/invoices`, `lib/domain`, `lib/__tests__`, `customers/lib`, `hooks/__tests__`. Features críticos (fleet, quotes, maintenance, returns, deliveries) no tienen tests unitarios. No es bloqueo arquitectónico pero amplifica riesgo de refactors.

---

## Plan ordenado (crítico → opcional)

```text
Paso 1  Adoptar queryKeys factories existentes en hooks (invoices/bookings/fleet/customers/crm)
Paso 2  Mover los 5 schemas Zod fuera de componentes a features/*/lib/*Schema.ts
Paso 3  Crear src/features/*/index.ts (barrels) exponiendo sólo API pública;
        subir el lint guardrail no-restricted-imports de warning → error
Paso 4  Reagrupar features/invoices/hooks/invoices/ en cfdi/ payments/ recurring/ pdf/
        y aplicar la misma poda de nesting redundante en fleet/, bookings/
Paso 5  Extraer useResourceList<T> que combine useListPage+filters+sort+pagination
        y migrar 2-3 páginas piloto (InvoicesPage, BookingsPage)
Paso 6  Revisar hooks *Logic (invoiceForm, bookingActions, forkliftForm, contractFormPrefill)
        y separar form-state vs mutation vs side-effects
Paso 7  Reorganizar src/components/ en layout/ forms/ feedback/ domain/
Paso 8  Reorganizar src/lib/ raíz: money/, format/; mover routes-config y routes a src/app/routes/
Paso 9  Dividir lib/pdf/theme/styles.ts por tipo de documento
Paso 10 Añadir tests unitarios a features críticos sin cobertura (fleet, quotes, maintenance)
```

## Detalle técnico

- **Pasos 1-3 son los de mayor ROI**: eliminan bugs latentes de invalidación, desacoplan validación, y bloquean a nivel lint la deuda futura. Bajo riesgo de regresión (cambios mecánicos guiados por TypeScript).
- **Paso 4** requiere actualizar imports masivamente (`rg -l` + sed seguro o `tsc --noEmit` como red).
- **Paso 5** es el único con riesgo real de regresión visual; hacerlo página por página detrás de los tests existentes.
- **Pasos 6-10** son mejoras incrementales que se pueden intercalar entre features nuevos sin sprint dedicado.

Sin cambios de código todavía; espero tu aprobación para arrancar por el Paso 1 (o el que prefieras saltar/priorizar).
