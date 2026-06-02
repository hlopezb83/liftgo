# Integrar CFDI al modal de Gasto + eliminar Recurrentes

## 1. Integrar carga de CFDI dentro del modal "Registrar Gasto"

`ExpenseFormDialog.tsx`:
- Agregar un dropzone compacto en la parte superior del modal (cuando aún no hay prefill) con texto "Arrastra el XML del CFDI o haz click para llenar automáticamente". Mostrar spinner mientras procesa.
- Al recibir XML: invocar la edge function `parse-cfdi-expense` (lógica reutilizada de `CfdiImportDialog`), manejar duplicados con toast y pre-llenar el formulario internamente (sin cerrar/reabrir el modal). El badge "Pre-llenado desde CFDI · UUID…" sigue mostrándose una vez detectado.
- Permitir limpiar el CFDI cargado (botón "Quitar CFDI") para volver a captura manual.
- Eliminar la prop `prefill` externa (ya no se necesita porque todo ocurre dentro del modal).

`OperatingExpensesPage.tsx`:
- Quitar el botón "Importar CFDI" y todo el estado/handler relacionado (`cfdiOpen`, `cfdiPrefill`, `CfdiImportDialog`). Queda un solo botón: "Registrar Gasto".

`CfdiImportDialog.tsx`:
- Eliminar archivo (su lógica de fetch/parseo se reubica en un pequeño hook `useCfdiParser` dentro de `src/features/expenses/hooks/` para mantener componentes ≤150 LOC).

## 2. Eliminar Gastos Recurrentes (código y datos)

Frontend a borrar:
- `src/features/expenses/hooks/expenseMutations/useGenerateRecurring.ts`
- `src/features/expenses/lib/recurringExpensesHelpers.ts`
- `src/features/expenses/lib/__tests__/recurringExpensesHelpers.test.ts`
- Re-export de `useGenerateRecurring` en `useOperatingExpenseMutations.ts` y `useOperatingExpenses.ts`.

Frontend a modificar:
- `OperatingExpensesPage.tsx`: quitar botón "Generar Recurrentes", import `RefreshCw`, hook `useGenerateRecurring`.
- `ExpenseEditDialog.tsx`: quitar el Switch "Gasto recurrente mensual" y el campo `is_recurring` del form/payload.
- `ExpenseFormDialog.tsx`: quitar `is_recurring: false` del payload.
- `ExpenseDetailSheet.tsx`: quitar badge "Recurrente".
- `useOperatingExpenses.ts`: quitar `is_recurring` del tipo `OperatingExpense`.
- `expenseMutations/types.ts`: quitar `is_recurring` del payload.

Base de datos:
- Migración: `ALTER TABLE public.operating_expenses DROP COLUMN is_recurring;`

## 3. Changelog
- Nueva entrada `v6.22.0` (minor: cambia UX y elimina feature):
  - "CFDI integrado dentro del modal Registrar Gasto"
  - "Eliminada la funcionalidad de Gastos Recurrentes"
- Actualizar `public/changelog.json` y crear `public/changelog/v6.22.0.json`.

## Fuera de alcance
- No se modifica la edge function `parse-cfdi-expense` (sigue funcionando igual, ahora invocada desde el modal).
- No se tocan otros módulos de "recurring" (facturación recurrente sigue intacta — esto es solo gastos).
