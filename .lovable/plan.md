## Problema

CI corre `deno fmt --check` y `supabase/functions/generate-recurring-invoices/index.ts` no cumple el formato estándar de Deno en 6 zonas (líneas 135, 172, 216, 248, 279, 330).

## Solución

Aplicar exactamente los cambios que `deno fmt` propone en el diff (paréntesis multilínea, template literals partidos, `select(...)` en dos líneas, alias de tipo sin paréntesis envolvente). Es un reformat puramente cosmético — sin cambios de lógica, tipos ni runtime.

## Archivos a tocar

- `supabase/functions/generate-recurring-invoices/index.ts` — aplicar el diff de `deno fmt`.

## Validación

- `cd supabase/functions && deno fmt --check` debe terminar en 0.
- No correr build/tests adicionales: el cambio es solo whitespace.

## Changelog

- `public/changelog.json` + `public/changelog/v6.88.2.json` — entrada `patch` "Formato Deno en generate-recurring-invoices".
