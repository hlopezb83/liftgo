# R10 — Estado y cierre

Revisé el archivo subido contra el código actual: **los 6 puntos del paquete R10 ya están aplicados en v7.274.0**.

| # | ID | Estado verificado |
|---|----|-------------------|
| 1 | R10-FE-01 (P0) | Guard `if (!v) return` presente en `RentalLineRow.tsx:34` y `SaleLineRow.tsx:29` |
| 2 | R10-DB-01 (P1) | `expire_stale_quotes` sin EXECUTE para `anon`/`authenticated`, con guard interno de `service_role` |
| 3 | R10-FE-02 (P1) | `DateRangePickerField` trata `from==to` como parcial y tiene botón "Aplicar" |
| 4 | R10-FE-03 (P1) | `useQuotePrefill` lee `qty ?? quantity` y ya no deriva la tarifa desde `total` |
| 5 | R10-DB-02 (P2) | Falso positivo: la línea con `CURRENT_DATE` vivía en `create_booking` y ya usa `today_mty()`; documentado en `supabase/tests/r10_smoke.sql` |
| 6 | R10-FE-04 (P2) | `InviteUserDialog` con `inFlightRef` anti doble-submit |

Versión, changelog, smoke SQL (`r10_smoke.sql`), 3 pruebas nuevas de prefill y el E2E del calendario ya quedaron actualizados. Lint sin errores, tipos limpios y 1490 pruebas en verde.

## Lo único pendiente

La verificación visual del calendario en el preview quedó bloqueada: la sesión del preview está cerrada, así que el navegador de pruebas termina en la pantalla de login y no puede abrir `/quotes/new`.

Al aprobar este plan haré:

1. Reintentar la verificación visual del `DateRangePickerField` en `/quotes/new` (primer clic no cierra, segundo clic aplica, botón "Aplicar" habilitado sólo con rango) con capturas de pantalla.
2. Reintentar la verificación visual de la edición de una cotización con partidas legacy para confirmar que el modelo y la tarifa se conservan y que no aparece el total fantasma.
3. Si la sesión sigue cerrada, reportarlo y dejar como evidencia las pruebas automatizadas ya existentes, sin cambios de código.

Requisito para el punto 1 y 2: que inicies sesión en el preview de Lovable antes de aprobar, para que la sesión quede disponible.

## Detalles técnicos

- No se prevé ningún cambio de código; es una fase de verificación. Si la verificación visual revela un defecto, lo reporto antes de tocar nada y acordamos el fix.
- Si aparece un ajuste menor, se versionaría como `v7.274.1` (patch) con su entrada en `CHANGELOG.md`, `public/changelog.json` y `public/changelog/v7.274.1.json`.
