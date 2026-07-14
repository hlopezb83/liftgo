# Fix: el selector de "Periodo de Renta" no abre el modal

## Diagnóstico

En `src/components/forms/DateRangePickerField.tsx` el trigger está estructurado así:

```tsx
<DialogTrigger asChild>
  <RangeTriggerButton hasFrom={...} label={...} />
</DialogTrigger>
```

`DialogTrigger asChild` usa el `Slot` de Radix, que clona al hijo inmediato inyectando `onClick`, `ref` y atributos ARIA. Pero `RangeTriggerButton` es un componente funcional wrapper que **no** propaga esos props al `<Button>` interno — los recibe y los descarta. Resultado: el click nunca llega al Button, así que el `Dialog` nunca abre.

Es un bug de ambos, desktop y mobile, exactamente lo que reporta el usuario. `DatePickerField` no tiene el problema porque ahí el `<Button>` está inline dentro del `DialogTrigger`.

## Cambios

**1. `src/components/forms/DateRangePickerField.tsx`**
- Reemplazar el uso del wrapper `RangeTriggerButton` por un `<Button>` inline dentro del `DialogTrigger asChild` (mismo patrón que `DatePickerField`). Eliminar el componente `RangeTriggerButton`.

**2. `public/changelog.json` + `public/changelog/v7.71.2.json`**
- Nueva entrada patch v7.71.2 — "Fix: el selector de fechas de Cotizaciones no abría el modal (DialogTrigger + wrapper rompía asChild)".

## Verificación

- Playwright headless: abrir `/quotes/new`, click en "Seleccionar fechas", confirmar que aparece el DialogContent con el calendario, seleccionar dos fechas y Aplicar.
- Repetir en viewport 390px y 1600px.

## Detalles técnicos

Radix `Slot` propaga props/ref al **elemento** del hijo directo. Cuando el hijo es un componente funcional, Slot le pasa los props como cualquier otro prop de React, y depende del componente reenviarlos. La regla del proyecto para triggers Radix con `asChild` queda: **el hijo directo debe ser un elemento nativo o un componente shadcn que ya reenvíe `ref` y spread props** (Button de shadcn cumple). Nunca envolver en un wrapper que no haga `...props`.
