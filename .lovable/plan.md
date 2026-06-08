
## ¿Es buena idea? — **No, y aquí está el porqué**

Revisé `invoiceFormSchema.ts` + `useInvoiceFormSubmit.ts`. La propuesta de cambiar campos opcionales a `.string().nullable().optional()` **introduce más problemas de los que resuelve** en este codebase:

### 1. No hay bug que arreglar
- Todos los campos de texto opcionales hoy son `z.string()` con default `""` (ver `EMPTY_CFDI`, `buildEmptyInvoiceValues`). 
- React Hook Form usa **inputs controlados**: cuando el usuario borra el campo, RHF guarda `""`, nunca `null` ni `undefined`. `z.string()` acepta `""` sin problema → **no hay validación que falle ni submission bloqueada**.
- La conversión `"" → null` ya se hace en el boundary de submit con el helper `nn()` en `useInvoiceFormSubmit.ts` (líneas 31, 35-45, 61, 67), justo antes de mandar a Supabase. Patrón correcto: **strings en el form, null en el DB**.

### 2. Hacerlo `.nullable().optional()` empeora las cosas
- El tipo inferido pasa de `string` a `string | null | undefined`. Cada consumidor (UI, helpers, PDF, edge functions) tendría que manejar tres estados para el mismo concepto semántico ("vacío").
- React Hook Form arroja warnings de *uncontrolled → controlled* si un input recibe `null/undefined`. Tendríamos que poner `value={field.value ?? ""}` en cada `<Input>`.
- El default `""` deja de tipar y obliga a `null as string | null | undefined` en `buildEmptyInvoiceValues`.

### 3. Lo que sí tiene sentido cambiar (oportunidades reales que vi)
Mientras revisaba, encontré dos issues legítimos:

**(a) `useInvoiceFormSubmit.ts` usa `format(date, "yyyy-MM-dd")` en `due_date` e `issued_at`.** Las columnas son `date` en Postgres. Esto repite exactamente el patrón frágil que migramos a `toYMD()` en el changelog 6.22.6. Debería usar `toYMD()`.

**(b) `lineItemSchema.description` es `z.string()` sin `.min(1)`.** Permite líneas con descripción vacía que llegan a CFDI. SAT rechaza descripciones vacías → falla `stamp-cfdi` con error genérico en lugar de validación amigable en el form.

## Plan

### 1. Migrar serializadores de fecha a `toYMD()`
En `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts`:
- Quitar `import { format } from "date-fns"`.
- Importar `toYMD` de `@/lib/date/toYMD`.
- Reemplazar:
  ```ts
  due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
  issued_at: format(issueDate, "yyyy-MM-dd"),
  ```
  por:
  ```ts
  due_date: toYMD(dueDate) ?? null,
  issued_at: toYMD(issueDate) ?? "",
  ```
  (`issued_at` siempre tiene valor porque `issueDate` es `z.date()` requerido — el `?? ""` es solo para satisfacer el tipado, nunca dispara).

### 2. Requerir descripción no vacía en line items
En `invoiceFormSchema.ts`:
```ts
description: z.string().trim().min(1, "Descripción requerida"),
```
- Verificar que `EditableLineItemsTable` muestre el error del field (RHF lo expone automáticamente vía `formState.errors.lineItems`).
- Actualizar el test `invoiceFormSchema.test.ts` para cubrir el nuevo case.

### 3. Documentar la decisión
Agregar memoria `mem://logic/zod-nullable-fields`: "Campos de texto opcionales que mapean a columnas nullable se modelan como `z.string()` con default `''` en el form. La conversión `'' → null` se hace en el boundary de submit (helper `nn()`). No usar `.nullable().optional()` para inputs controlados."

### 4. Changelog
Entrada `6.22.7` patch en `public/changelog.json` + `public/changelog/v6.22.7.json`.

## Archivos tocados
- `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts`
- `src/features/invoices/lib/invoiceFormSchema.ts`
- `src/features/invoices/lib/invoiceFormSchema.test.ts`
- nueva memoria + changelog

Sin DB, sin UI, sin backend.

---

¿Avanzo con esto, o prefieres que de todas formas convierta los strings opcionales a `.nullable().optional()`?
