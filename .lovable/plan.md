## Lote 4 — Higiene profunda + endurecimiento de coverage

Tres frentes pequeños e independientes. Sin tocar lógica de negocio. Sin cambios de UI visibles.

### 1. Refactor `useBreadcrumbEntityLabel` (tipado)

`src/layouts/hooks/useBreadcrumbEntityLabel.ts` usa `supabase.from(resolver.table as never)` y `r.<campo> as string` — viola la regla global "sin `as`". Cambios:

- Reemplazar el mapa `RESOLVERS` por una unión discriminada tipada por nombre de tabla (literal type de `keyof Database["public"]["Tables"]`).
- Eliminar los 9 `as string` aplicando `coerce.ts` (helper `asString`) o checks `typeof`.
- Eliminar el `as never` en `supabase.from` usando un narrow por `resolver.table`.
- Añadir test unitario nuevo `useBreadcrumbEntityLabel.test.ts`: 3 casos (ID válido, segmento sin resolver, ID no-UUID → no query).

### 2. Magic numbers → constantes nombradas

Auditar y extraer 4–6 magic numbers de alto impacto. Candidatos confirmados por `rg`:

- `30` (días de alerta de seguros) en `fleet` → `INSURANCE_ALERT_DAYS_BEFORE` en `src/features/fleet/lib/constants.ts`.
- `200` (horas/mes incluidas en renta) en `quotes`/`bookings` → `INCLUDED_HOURS_PER_MONTH` en `src/lib/config.ts`.
- `7` (días/semana) y `30` (días fallback mensual) en `rentalCalculation.ts` → constantes locales `DAYS_PER_WEEK`, `DAYS_PER_MONTH_FALLBACK`.
- `3` (buffer de mantenimiento) en booking constraints UI → `MAINTENANCE_BUFFER_DAYS` colocada junto a la constraint UI (la regla server-side ya está en SQL, sólo unificamos la copia client-side).

Antes de tocar nada, listo cada ocurrencia con su archivo y línea para confirmar contigo.

### 3. Subir thresholds de coverage tras el nuevo baseline

Tras Lote 2 el baseline subió a `13.98 / 12.92 / 10.08 / 14.36`. Hoy los thresholds están en `13 / 12 / 9 / 13` — margen real <1pp, riesgo de regresión silenciosa.

Plan:
- Correr `bunx vitest run --coverage` localmente y leer el reporte (`coverage/coverage-summary.json`) para tener el número exacto post-Lote-3.
- Subir cada threshold a `medido − 1pp` (no 5pp como dijimos antes — con la suite actual eso bloquearía al primer hook nuevo no testeado).
- Documentar en el changelog el baseline y el margen.

### Detalles técnicos

- `useBreadcrumbEntityLabel`: `Database["public"]["Tables"][T]["Row"]` permite tipar `format(row)` por tabla, eliminando los casts. Trade-off: el código crece ~15 líneas, pero queda 0 `as`.
- Magic numbers: no toco semántica, sólo extraigo. Cada constante lleva JSDoc con la regla de negocio (ej: "Días antes del vencimiento para disparar alerta de seguro — coincide con `notify_insurance_expiration` en SQL").
- Coverage: si el threshold queda en valores frágiles (ej. `branches: 12.5`), redondeo hacia abajo al entero.

### Entregables

- `src/layouts/hooks/useBreadcrumbEntityLabel.ts` refactorizado, sin `as`.
- `src/layouts/hooks/__tests__/useBreadcrumbEntityLabel.test.ts` (nuevo, 3 tests).
- 4–6 constantes nuevas en sus respectivos `lib/constants.ts` o `lib/config.ts`.
- `vitest.config.ts` con thresholds ajustados al baseline real − 1pp.
- `public/changelog.json` + `public/changelog/v6.63.0.json` (patch).

### Verificación

- `bunx tsc --noEmit -p tsconfig.app.json` limpio.
- `bunx vitest run` 100% verde (570 + 3 nuevos).
- `bunx knip` sin nuevos hallazgos.
- `rg "\\bas\\s+(string|never|number)\\b" src/layouts/hooks/useBreadcrumbEntityLabel.ts` → 0 matches.

### Fuera de alcance (para Lote 5+)

- Refactor de archivos >300 LOC (no se identificaron urgentes en Lotes 1–3).
- Audit de god components (separación UI / data / lógica).
- Subir branches >20% (requiere refactor de hooks complejos, no sólo tests).

¿Procedo con los 3 frentes en este Lote, o prefieres acotar a sólo 1–2?