## Problema

Al navegar entre meses en el `Calendar`, el popover cambia de alto porque algunos meses ocupan 5 semanas y otros 6. El contenedor "brinca" verticalmente y, cuando el popover está anclado al trigger, la UI adyacente se percibe como si se moviera.

## Causa raíz

`react-day-picker` por defecto renderiza sólo las semanas necesarias del mes (5 o 6 filas). Sin altura reservada, el `PopoverContent` se re-mide en cada cambio de mes.

## Fix

Habilitar `fixedWeeks` en `<DayPicker>` dentro de `src/components/ui/calendar.tsx`. Con esa prop, rdp siempre pinta 6 semanas (rellenando con días `outside` que ya tenemos estilizados como opacos), así que todos los meses miden lo mismo y el popover deja de saltar.

Cambio único:

```tsx
<DayPicker
  locale={esLocale}
  formatters={formatters}
  showOutsideDays={showOutsideDays}
  fixedWeeks
  ...
/>
```

Nota: ya usamos `showOutsideDays` por defecto y las clases `outside` para atenuar días fuera del mes, así que el fix es visualmente consistente con el estilo actual.

## Validación

- Playwright: abrir `/quotes/new` → date picker de rango → navegar Feb → Mar → Abr y verificar que el `PopoverContent` mantiene la misma altura (screenshot antes/después del click).
- Revisar los pickers de `/invoices`, `/contracts/new` y filtros de `/reports` para confirmar que no hay regresiones visuales.

## Changelog

Nueva entrada `patch` v7.72.7 en `public/changelog.json` + detalle en `public/changelog/v7.72.7.json`.

## Archivos

- `src/components/ui/calendar.tsx` (agregar `fixedWeeks`)
- `public/changelog.json`
- `public/changelog/v7.72.7.json`
