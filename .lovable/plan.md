## Diagnóstico (rastreo real)

Rastreé la actividad del usuario `admin@lopezbenavides.com` en la base:

- **20:36:13** → gasto registrado OK · `renta` · $45,432 · `expense_date = 2026-06-03` · CFDI vinculado.
- **20:47:48** → gasto registrado OK · `otro` · $69,818 · `expense_date = 2026-04-23` · CFDI vinculado.

Ambos gastos **sí quedaron guardados** en `operating_expenses`. El `useCreateExpense` invalidó la query y emitió el toast `success "Gasto registrado"`.

Luego en el replay (20:49) el usuario abrió los filtros de la lista y seleccionó **mes "Jun 2026"** y **categoría "renta"**. El gasto de las 20:47 tiene `expense_date = 23/abr/2026` y categoría `otro`, así que **ambos filtros lo ocultaron**. Resultado: el usuario pensó que no se había registrado.

Es decir, no es un bug de guardado ni de RLS — es un problema de visibilidad post-registro: el toast pasó desapercibido y la lista filtrada no mostraba la fila nueva.

## Plan de prevención

Objetivo: que sea imposible que un gasto recién creado "desaparezca" sin que el usuario lo note. Solo cambios de UI/UX en el módulo de gastos.

### 1. Toast de éxito más informativo
En `useCreateExpense` (`onSuccess`), pasar a `toast.success` un cuerpo con la info clave del gasto:
- Título: `"Gasto registrado"`.
- Description: `"<categoría> · <monto MXN> · <DD/MM/YYYY>"`.
- `duration: 6000` para que dure más.

Esto requiere que `mutationFn` devuelva el registro insertado (`.select().single()`) y que `onSuccess` reciba esa data.

### 2. Aviso cuando los filtros activos ocultan el nuevo gasto
Mover la responsabilidad del `onSuccess` al componente que dispara el create (`ExpenseFormDialog` / `OperatingExpensesPage`):

- Después de cerrar el dialog, comparar el gasto recién creado contra los filtros activos (`filterMonth`, `filterCategory`, `search`) expuestos por `useExpenseFilters`.
- Si **no pasa** los filtros, mostrar un `toast.warning`:
  - `"Gasto creado pero oculto por los filtros actuales"`
  - Action button: **"Limpiar filtros"** → resetea `filterMonth='all'`, `filterCategory='all'`, `search=''`.

Para esto, `useExpenseFilters` necesita exponer un helper `resetFilters()` y la página debe pasar al dialog un callback `onCreated(newExpense)` que ejecuta esta lógica.

### 3. Resaltado breve de la fila recién creada
- `OperatingExpensesPage` guarda en estado `highlightedId` con el id del gasto recién creado durante 3s.
- El `mobileCardRender` y la tabla aplican una clase (`bg-primary/5 ring-1 ring-primary/30`) cuando `row.id === highlightedId`.
- Si la fila quedó visible, el usuario la ve inmediatamente; si no, ya tiene el toast warning del punto 2.

### 4. (Pequeño) Errores de validación silenciosa
Defensa adicional: si `form.handleSubmit(onSubmit)` se dispara con el formulario inválido (caso borde donde el usuario limpia el monto o la categoría tras cargar un CFDI), hoy no se emite nada. Agregar el segundo callback a `handleSubmit` para emitir un `notifyError({ message: "Revisa los campos del formulario" })` cuando hay errores de Zod.

## Detalles técnicos

Archivos a modificar (solo frontend, sin tocar RLS ni edge functions):

- `src/features/expenses/hooks/expenseMutations/useCreateExpense.ts`
  - `.insert(expense).select("*").single()` → retornar la fila.
  - `onSuccess` recibe `data` y emite toast enriquecido.
- `src/features/expenses/hooks/expenses/useExpenseFilters.ts`
  - Exportar `resetFilters()` y una función pura `matchesFilters(expense)` reutilizable.
- `src/features/expenses/components/expenses/ExpenseFormDialog.tsx`
  - Aceptar prop opcional `onCreated?: (e: OperatingExpense) => void`.
  - Pasar callback al `createExpense.mutate` en lugar de cerrar a ciegas.
- `src/features/expenses/pages/OperatingExpensesPage.tsx`
  - Estado `highlightedId`; pasar `onCreated` al dialog que: cierra, setea highlight 3s, evalúa `matchesFilters`, emite `toast.warning` con acción `Limpiar filtros` si no pasa.
  - Aplicar clase de highlight en columnas de tabla (vía `meta.rowClassName` o wrapper) y en `mobileCard`.
- Sin cambios en DB, RLS ni edge functions.

## Changelog

Última entrada al final: `6.25.4` (minor): "Confirmación enriquecida y aviso cuando un gasto recién registrado queda oculto por filtros activos".
- `public/changelog.json` → nueva entrada al inicio del array.
- `public/changelog/v6.25.4.json` → detalle.
