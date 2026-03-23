

## Bug: Proveedor no se guarda al registrar gasto

### Causa raíz

El componente `ExpenseFormDialog` tiene un estado `supplierId` conectado al `SupplierSelector`, pero en la función `onSubmit` **nunca se incluye `supplier_id`** en el objeto que se pasa a `createExpense.mutate()`. El valor se descarta silenciosamente.

Además, el tipo del parámetro en `useCreateExpense` no incluye `supplier_id`, por lo que el campo está bloqueado a nivel de TypeScript.

### Corrección

**1. `src/hooks/useOperatingExpenses.ts` (línea 50)**
- Agregar `supplier_id?: string | null` al tipo del parámetro de `useCreateExpense`.

**2. `src/components/expenses/ExpenseFormDialog.tsx` (líneas 57-67)**
- Incluir `supplier_id: supplierId || null` en el objeto pasado a `createExpense.mutate()`.

### Cambios exactos

En `useOperatingExpenses.ts`, el tipo del mutation pasa de:
```typescript
{ category; description?; amount; expense_date; is_recurring? }
```
a:
```typescript
{ category; description?; amount; expense_date; is_recurring?; supplier_id?: string | null }
```

En `ExpenseFormDialog.tsx`, el objeto del mutate pasa de:
```typescript
{ category, description, amount, expense_date, is_recurring: false }
```
a:
```typescript
{ category, description, amount, expense_date, is_recurring: false, supplier_id: supplierId || null }
```

Dos líneas cambiadas en total. Sin cambios de base de datos requeridos (la columna `supplier_id` ya existe en la tabla).

