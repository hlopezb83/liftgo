## Problema

En el modal de "Periodo de Renta" (nuevas cotizaciones) los botones de "mes anterior" / "mes siguiente" no funcionan. El calendario se abre pero no se puede cambiar de mes.

## Causa

`src/components/ui/calendar.tsx` fue escrito para el layout de `react-day-picker` v8/v9, pero el proyecto ya está en **v10**. En v10 el `<nav>` con los chevrons se renderiza como hermano de `month_caption` dentro de `month`, no dentro de él.

Nuestras clases actuales:

- `button_previous` / `button_next`: `absolute left-1 top-1 …`
- `month`: `space-y-4` (sin `position: relative`)
- `month_caption`: `relative`

Resultado: los chevrons se posicionan absolutamente respecto al ancestro posicionado más cercano (el `DialogContent`), quedando fuera del `<nav>` o solapados por el header del diálogo, así que los clicks caen en el header/backdrop y nunca disparan la navegación.

## Solución

Ajustar `src/components/ui/calendar.tsx` al layout real de rdp v10:

1. Hacer que `month` sea `relative` (contenedor posicionado correcto).
2. Reescribir `nav` como una capa absoluta que ocupe la fila del caption:
   `absolute inset-x-1 top-1 flex justify-between items-center pointer-events-none`.
3. Quitar `absolute` de `button_previous` / `button_next` y dejarlos como botones normales dentro del `nav`, con `pointer-events-auto` para restaurar el click y `size-7 bg-transparent p-0 opacity-60 hover:opacity-100`.
4. Verificar que sigue sin duplicar chevrons con el `components.Chevron` custom.

Con eso los botones vuelven a recibir clicks y `onPrevClick` / `onNextClick` de rdp v10 disparan normalmente.

## Verificación

- Playwright headless a `/quotes/new`, abrir "Periodo de Renta *", click en chevron derecho, capturar screenshot y confirmar que el caption cambia de mes.
- Repetir en `DateRangePickerField` de filtros (facturas) y en `DatePickerField` (Válida Hasta) para asegurar que ningún otro consumidor del `Calendar` se rompió.

## Changelog

Nueva entrada patch `v7.72.5` en `public/changelog.json` + `public/changelog/v7.72.5.json` describiendo el fix de navegación de meses en calendarios (rdp v10 layout).
