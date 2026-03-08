

## Plan: Agregar campo de fecha al formulario de Nueva Devolución (v3.19.7)

### Problema
El formulario de nueva devolución no permite seleccionar la fecha de inspección — siempre usa `now()` del servidor. Esto impide registrar inspecciones realizadas en días anteriores.

### Cambios

**1. Migración SQL** — Agregar parámetro `p_inspected_at` a la función `complete_return_inspection`
- Nuevo parámetro `p_inspected_at timestamptz DEFAULT now()`
- Usar ese valor en el `INSERT INTO return_inspections` en lugar de depender del default de la columna

**2. `src/pages/ReturnInspectionPage.tsx`**
- Agregar `inspectedAt: new Date()` al `initialForm`
- Agregar `DatePickerField` al formulario del diálogo (antes del campo de condición)
- Pasar la fecha seleccionada como `inspected_at` al mutation

**3. `src/hooks/useReturnInspections.ts`**
- Agregar `p_inspected_at` al llamado del RPC

**4. `src/lib/changelog.ts`** — v3.19.7

### Archivos
- **Migración**: ALTER FUNCTION `complete_return_inspection` con nuevo parámetro
- **Editar**: `ReturnInspectionPage.tsx`, `useReturnInspections.ts`, `changelog.ts`

