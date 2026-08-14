# Captura rápida de fechas con teclado (DatePickerMx)

Objetivo: que un operador de contabilidad pueda teclear fechas con el teclado numérico, sin abrir el calendario, en todos los campos de fecha de la app.

## Qué se construye

**1. Input enmascarado DD/MM/AAAA**

Cada campo de fecha muestra ahora una caja de texto con máscara `__/__/____` a la izquierda y el botón de calendario a la derecha. Al teclear números, el cursor salta solo entre día, mes y año; las diagonales se escriben automáticamente. Se acepta también pegar `15/09/2026` o `2026-09-15`.

**2. Atajos de teclado**

- `H` (Hoy) — escribe la fecha de hoy en Monterrey. También se acepta `T` para quien viene de sistemas en inglés.
- `+` / `-` — suben o bajan el segmento donde está el cursor (día, mes o año).
- `Flecha arriba / abajo` — mismo efecto que `+` / `-`.
- `Flecha izquierda / derecha` — mueven entre segmentos.
- `Esc` — limpia el campo si está incompleto.

**3. Validación**

- Fechas imposibles se marcan al salir del campo: "31/02/2026 no existe".
- Años bisiestos se calculan correctamente (29 de febrero solo en años válidos).
- Si la fecha cae en fin de semana o día festivo, aparece una nota informativa bajo el campo — **no bloquea** el guardado. Ejemplo: "16/09/2026 — Día de la Independencia (inhábil bancario)".

**4. Calendario de festivos**

Oficiales de ley (LFT art. 74) más los bancarios: jueves y viernes santo, 2 de noviembre, 12 de diciembre. Los movibles (lunes de febrero/marzo/noviembre y semana santa) se calculan por año, no se listan a mano, así que sirve para cualquier año.

## Alcance

La máscara se agrega dentro del componente compartido `DatePickerField`, por lo que todas las pantallas que ya usan campos de fecha lo obtienen sin cambios adicionales: facturas, reservas, cotizaciones, contratos, inspecciones de devolución, mantenimiento y los filtros de tablas. El calendario emergente actual se conserva igual.

## Detalles técnicos

- `src/lib/date/holidaysMx.ts` (nuevo): `isMxHoliday(date)` y `mxHolidayLabel(date)`. Festivos fijos + movibles calculados por año (lunes n-ésimo y Pascua por algoritmo de Meeus/Gauss). Sin dependencias nuevas.
- `src/lib/date/parseMaskedDate.ts` (nuevo): funciones puras `formatMask(digits)`, `parseMaskedDate(text)` (valida rango real de días por mes y bisiesto vía reconstrucción `new Date(y, m-1, d)`), `stepSegment(text, segment, delta)`. Trabajan sobre fecha calendario local, consistente con `toYMD` / `formatMtyCalendarDate` — sin conversión de zona.
- `src/components/forms/MaskedDateInput.tsx` (nuevo): input controlado que maneja `onKeyDown` (dígitos, `+`/`-`, flechas, `h`/`t`, backspace) y expone `value: Date | undefined` + `onChange`. Sin `onBeforeInput` hacks; el estado es el string de dígitos.
- `src/components/forms/DatePickerField.tsx`: se compone `MaskedDateInput` + el botón/diálogo de calendario existente. La prop `disabled: Matcher` sigue aplicando al calendario y ahora también marca error si la fecha tecleada cae en un día deshabilitado. `DateField` (wrapper RHF) no cambia su API.
- `src/components/forms/fields/DateRangeField.tsx` y `DateRangePickerField.tsx`: reciben dos máscaras (inicio/fin) reutilizando el mismo input.
- La nota de festivo se renderiza como texto `text-muted-foreground` bajo el campo, separada del `FormMessage` de error, para no interferir con la validación de react-hook-form.
- Accesibilidad: `inputMode="numeric"`, `aria-describedby` apuntando a la nota de festivo, `aria-invalid` en fecha imposible, y una lista de atajos en `title`/tooltip del botón de calendario.

## Pruebas

- Unitarias de `holidaysMx` (movibles 2024-2030, semana santa, fines de semana).
- Unitarias de `parseMaskedDate` (bisiesto, 31/04, pegado en ISO, incrementos con acarreo de mes/año).
- Componente: teclear `15092026` produce la fecha correcta; `H` escribe hoy; `+` sobre el mes avanza; nota de festivo aparece en 16/09.
- Changelog: entrada **minor**.
