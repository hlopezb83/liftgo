

## Plan: Gastos Recurrentes

### Concepto

Agregar un campo `is_recurring` (boolean) a la tabla `operating_expenses`. Cuando un gasto se marca como recurrente, se muestra un badge en la tabla y un botón "Generar Recurrentes" que crea automáticamente los registros del mes actual para todos los gastos recurrentes que aún no tienen entrada ese mes.

### Flujo

1. Al crear/editar un gasto, el usuario puede activar un switch "Gasto recurrente mensual"
2. En la tabla, los gastos recurrentes muestran un badge con ícono de repetir
3. Un botón "Generar Recurrentes" en el header busca gastos con `is_recurring = true`, y para cada uno verifica si ya existe un registro del mismo `category` + `description` en el mes actual. Si no existe, lo crea copiando monto y categoría con fecha del 1ro del mes actual

### Cambios

1. **Migración DB**: Agregar columna `is_recurring boolean default false` a `operating_expenses`
2. **`src/hooks/useOperatingExpenses.ts`**:
   - Agregar `is_recurring` al tipo `OperatingExpense` y a las interfaces de mutación
   - Crear hook `useGenerateRecurring` que consulta gastos con `is_recurring=true`, verifica duplicados del mes actual, e inserta los faltantes
3. **`src/pages/OperatingExpensesPage.tsx`**:
   - Agregar `Switch` "Recurrente mensual" al diálogo de crear/editar
   - Mostrar badge `Repeat` en la tabla para gastos recurrentes
   - Agregar botón "Generar Recurrentes" junto al botón "Nuevo Gasto"
   - Incluir `is_recurring` en el formulario
4. **`src/lib/changelog.ts`** — v3.15.0

### Sin cambios al Estado de Resultados
Los gastos generados son registros normales en `operating_expenses`, el reporte los consume igual.

