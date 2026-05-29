## Plan

1. **Quitar botón "Previsualizar"** en `src/features/quotes/components/quotes/QuoteDetailActions.tsx`:
   - Eliminar el `<Button>` con ícono `Eye` y el estado `previewOpen`.
   - Eliminar el `<QuotePreviewDialog />` montado al final y sus imports (`useState`, `Eye`, `QuotePreviewDialog`).
   - Conservar el archivo `QuotePreviewDialog.tsx` por si se reutiliza después.

2. **Alinear acciones a la izquierda** en `src/components/DetailPageHeader.tsx`:
   - Cambiar el contenedor de acciones de `justify-end` a `justify-start`, y agregar un `pl-12` (o equivalente al ancho del botón de regresar + gap) para que los botones queden a la altura del título, no debajo de la flecha.

3. **Changelog patch 6.14.2**: "Se retira botón Previsualizar de cotizaciones y se alinean acciones del encabezado a la izquierda".