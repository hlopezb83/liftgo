

## Plan: Crear ExpenseFormDialog con react-hook-form + zod (v3.17.1)

### Concepto

Crear un componente `ExpenseFormDialog` reutilizable que reemplace el dialog inline actual en `OperatingExpensesPage`. Usa `react-hook-form` + `zod` con mensajes de error en español mexicano e inline bajo cada campo.

### Archivos

**1. `src/lib/formSchemas.ts`** — Agregar schema `expenseFormSchema`:
- `expense_date`: `z.date()` con mensaje "La fecha es requerida"
- `amount`: `z.number().positive("El monto debe ser mayor a 0")`
- `category`: `z.enum([...categories])` con mensaje "Selecciona una categoría"
- `description`: `z.string().default("")`

**2. `src/components/expenses/ExpenseFormDialog.tsx`** — Nuevo componente:
- Props: `open`, `onOpenChange`
- `useForm` con `zodResolver(expenseFormSchema)`
- Campos: `DatePickerField` (fecha), Input numérico con prefijo `$` (monto), `Select` (categoría con "Costo de Venta (Directo)"), `Textarea` (descripción)
- `FormActions` para botones submit/cancel
- Llama `useCreateExpense().mutate()` on submit, cierra dialog on success, reset form
- Errores inline usando `FormField`/`FormMessage` de shadcn

**3. `src/pages/OperatingExpensesPage.tsx`** — Reemplazar el botón "Nuevo Gasto" para usar `ExpenseFormDialog` en lugar del dialog inline existente (mantener el dialog de edición tal cual)

**4. `src/lib/changelog.ts`** — v3.17.1

### Detalle técnico

- El schema convierte `amount` de string a number via `z.coerce.number()`
- `DatePickerField` ya existente se integra con `react-hook-form` via `Controller`
- Categorías usan `EXPENSE_CATEGORY_LABELS` del hook existente, sobreescribiendo `costo_venta` a "Costo de Venta (Directo)"
- `FormActions` existente maneja el estado de loading/submit

