# Fix: Modal de feedback se desborda al adjuntar screenshot

## Problema

Cuando el usuario selecciona un elemento en el módulo de feedback:
1. Se captura un screenshot
2. Se renderiza dentro del modal junto con el resto del formulario (tipo, ruta, título, descripción, badges, botones)
3. El `DialogContent` solo limita el ancho (`max-w-lg`) pero **no la altura**, por lo que el modal crece más allá del viewport y el botón "Enviar reporte" queda fuera de pantalla en laptops (≤768px de alto).

## Solución (solo UI, sin tocar lógica)

### 1. `FeedbackFormDialog.tsx` — limitar altura del modal y hacer el cuerpo scrollable

- `DialogContent`: agregar `max-h-[90vh] flex flex-col` (mantiene `max-w-lg`).
- `<form>`: convertir en `flex-1 min-h-0 flex flex-col` para que sea contenedor flex.
- Envolver `<FeedbackFormFields ... />` en un `<div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">` para que **solo el contenido del formulario** haga scroll.
- Mover `<DialogFooter>` fuera del área scrollable (queda fijo abajo) con `className="shrink-0 border-t pt-3 mt-0"`.

### 2. `FeedbackFormFields.tsx` — preview del screenshot más compacto

- Cambiar la imagen del screenshot de `max-h-48` (192px) a `max-h-32` (128px) para reducir presión vertical y mantener visible la información clave.
- Sin cambios en la lógica de selección/captura.

## Lo que NO cambia

- Lógica de `ElementPicker`, `captureScreenshotFile`, `useCreateFeedback`, schema, contexto.
- Hook `cssPath.ts` (migración a `@medv/finder` ya hecha en v6.7.6).
- DB, RPCs, edge functions.

## Verificación

- Probar en viewport 1000×673 (el del usuario): el modal debe caber con scroll interno y el footer siempre visible.
- Probar también en 1920×1080 y móvil ≤414px.
- `bunx vitest run` debe seguir pasando 71/71.

## Changelog

- `public/changelog.json` + `public/changelog/v6.7.7.json` — patch: "Modal de feedback ahora cabe en pantallas pequeñas (scroll interno, footer fijo, preview compacto)".
