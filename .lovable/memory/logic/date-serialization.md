---
name: Date serialization
description: Reglas para serializar fechas a Supabase según el tipo de columna (date vs timestamptz)
type: feature
---
Para columnas Postgres tipo `date` usar `toYMD(date)` de `@/lib/date/toYMD` — extrae componentes locales (getFullYear/Month/Date) y devuelve "YYYY-MM-DD". NUNCA usar `.toISOString().slice(0,10)` sobre una `Date` que pueda venir en UTC: corre el día.

Para columnas `timestamptz` (`created_at`, `inspected_at`, `closed_at`, `signed_at`, `paid_at` si es timestamp, etc.) sí usar `.toISOString()` o `nowMty().toISOString()` — esas columnas necesitan UTC.

`DateRangePickerField` y `DatePickerField` ya normalizan las `Date` que reciben de react-day-picker a medianoche local antes de invocar `onSelect`, así que los consumidores reciben siempre una Date "limpia".
