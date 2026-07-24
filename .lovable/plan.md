## Problema

El botón "Actualizar" del calendario (`src/features/calendar/pages/CalendarPage.tsx:113-121`) sí funciona a nivel de datos — invoca `qc.invalidateQueries({ queryKey: bookingKeys.all })` — pero **no muestra ningún toast ni ningún indicador visual**, por eso parece que no hace nada. La invalidación dispara un refetch en background sin feedback perceptible.

## Cambio propuesto (v7.226.2, patch)

Ajustar únicamente el `onClick` del botón en `CalendarPage.tsx`:

1. Convertir el handler en `async`, hacer `await qc.refetchQueries({ queryKey: bookingKeys.all, type: "active" })` para esperar de verdad a que se recarguen las queries visibles.
2. Envolver con `toast.promise(...)` de `sonner` para mostrar:
   - Loading: "Actualizando calendario…"
   - Success: "Calendario actualizado"
   - Error: "No se pudo actualizar el calendario"
3. Deshabilitar el botón mientras corre (state local `isRefreshing`) y agregar `animate-spin` al `RefreshIcon` durante la carga, siguiendo el patrón visual del resto de la app.

No se toca la lógica de fetching ni ninguna otra query. Cambio quirúrgico y aislado a un solo archivo.

## Changelog

Nueva entrada `public/changelog/v7.226.2.json` + índice, tipo `patch`, categoría `fix`: "Botón Actualizar del calendario ahora muestra feedback (toast + spinner) y espera el refetch antes de resolver."