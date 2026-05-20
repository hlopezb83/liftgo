# Ola B — Refactor de tamaño (§19 Power of 10)

Objetivo: bajar 6 hooks por debajo de 80 LOC y 2 diálogos por debajo de 150 LOC, marcando las tablas densas como excepción documentada §19. Sólo refactor estructural, sin cambios funcionales ni de UI.

## 1. Hooks oversized (>80 LOC)

| Archivo | LOC | Acción |
|---|---|---|
| `useInvoicePrefill.ts` | 156 | Mover `cfdiFromInvoice`, `enrichLineItem`, `buildFromInvoice`, `buildFromQuote` → nuevo `invoiceForm/invoiceFormBuilders.ts`. Hook queda con sólo 2 `useEffect`. |
| `useInvoiceFormLogic.ts` | 121 | Extraer `useInvoiceFormHandlers(form, customers, bookings, forklifts)` (handleCustomerSelect + handleBookingSelect) y `useInvoiceFormTotals(form)` → nuevos archivos en `hooks/invoiceForm/`. |
| `useQuotePrefill.ts` | 120 | Mover `applyBaseFields`, `applyLogistics`, `applySaleLines`, `applyRentalLines`, `matchModel`, `lineToRentalLine`, `getRentalMeta`, `rebuildRentalLinesFromItems` → nuevo `quoteForm/quoteFormPrefillHelpers.ts`. |
| `useOperatingExpenseMutations.ts` | 116 | Mover `buildRecurringInserts` → `expenses/lib/recurringExpensesHelpers.ts`. |
| `useUserMutations.ts` | 114 | Dividir por concern: `useUserMutations.ts` mantiene `useUpdateRole`, `useUpdateName`. Nuevo `useUserAdminMutations.ts` con `useInviteUser`, `useDeleteUser`, `useResetPassword`, `useToggleStatus`. Actualizar barrel/imports. |
| `useMaintenanceForm.ts` | 111 | Mover `buildMaintenancePayload` + `initialForm` + schema → `maintenance/lib/maintenanceFormHelpers.ts`. Hook conserva sólo estado y handlers. |

## 2. Componentes oversized (>150 LOC)

| Archivo | LOC | Acción |
|---|---|---|
| `DeliveryFormDialog.tsx` | 199 | Extraer JSX de los `FormField` a `DeliveryFormFields.tsx` (recibe `form`, `forklifts`, `bookings`, `activeDrivers`). Dialog queda <80 LOC. |
| `ExpenseFormDialog.tsx` | 159 | Extraer `ExpenseFormFields.tsx` (recibe `form`, `supplierId`, `setSupplierId`). |
| `CustomerFormSections.tsx` | 182 | Excepción §19 — ya es un conjunto de secciones. Marcar con `// arch:excepción §19 (secciones agrupadas de un mismo formulario)`. |
| `RentalLineItems.tsx` (157) / `SaleLineItems.tsx` (152) | | Excepción §19 — tabla densa editable. Marcar con `// arch:excepción §19 (tabla densa editable)`. |
| `ProfitabilityByModelReport.tsx` (198), `IncomeStatementTable.tsx` (189), `UtilizationByModelReport.tsx` (154) | | Excepción §19 — tabla densa de reporte. Marcar con `// arch:excepción §19 (tabla densa de reporte)`. |
| `auditTrailConstants.tsx` (159) | | Excepción §19 — archivo de constantes/labels. Marcar comentario. |

## 3. Changelog

Crear `public/changelog/v6.7.3.json` (patch) + entrada en `public/changelog.json`:
- "Refactor estructural — hooks ≤80 LOC, diálogos ≤150 LOC"
- Listar archivos divididos y excepciones documentadas.

## 4. Verificación

- `bunx knip --no-progress` → 0 dead exports tras la división.
- Lectura visual de los archivos divididos para confirmar imports correctos.
- Sin cambios de comportamiento esperados: el typecheck del harness cubre regresiones.

## Detalles técnicos

- Cada helper extraído es función pura tipada (sin `any`/`!`/`as`).
- Los nuevos archivos respetan ≤150 LOC componentes / ≤80 LOC hooks.
- Mantener las firmas públicas: ningún consumidor cambia su import salvo `useUserMutations` (4 hooks migran al nuevo `useUserAdminMutations`); ajustar consumidores en la misma pasada.
- Comentarios `// arch:excepción §19 (...)` justifican los archivos que conscientemente quedan sobre el límite.

Ola C (siguiente, no incluida aquí): actualizar `dependency_audit.py` para detectar `file-saver` dinámico, regenerar `docs/dependency-audit.md` y documentar `html2canvas` en §20.4.