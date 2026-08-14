# Auditoría de actualización de librerías

Estado a hoy (14 ago 2026). Se comparó cada dependencia de `package.json` contra su última versión publicada.

## Resumen

| Grupo | Paquetes | Riesgo |
|---|---|---|
| Parches | 5 | Nulo |
| Menores | 9 | Bajo |
| Mayores seguros | 3 | Medio |
| Mayores bloqueados/aplazados | 3 | Alto |

## Lote 1 — Parches (aplicar de inmediato)

- `@tanstack/react-virtual` 3.14.8 → 3.14.9
- `dompurify` 3.4.12 → 3.4.13 (sanitización, conviene estar al día)
- `marked` 18.0.7 → 18.0.9
- `sonner` 2.0.7 → 2.0.8
- `knip` 6.32.0 → 6.32.2 (dev)

## Lote 2 — Menores (aplicar en el mismo sprint)

- `@supabase/supabase-js` 2.110.9 → 2.112.3
- `@sentry/react` 10.68.0 → 10.70.0
- `react-hook-form` 7.83.0 → 7.85.0
- `@hookform/resolvers` 5.5.7 → 5.8.0 (subir junto con react-hook-form)
- `@react-pdf/renderer` 4.5.1 → 4.6.1 (revalidar PDFs: contrato, pagaré, estado de cuenta)
- `lucide-react` 1.27.0 → 1.31.0 (registro central de íconos absorbe el cambio)
- `papaparse` 5.5.4 → 5.6.0
- `typescript-eslint` 8.66.0 → 8.67.0 (dev)
- `rollup-plugin-visualizer` 7.0.1 → 7.1.1 (dev)

## Lote 3 — Mayores viables (uno por PR, con verificación)

- `@testing-library/jest-dom` 6 → 7 — solo tests; requiere revisar matchers deprecados.
- `@types/node` 24 → 26 — alinear con `.node-version` (24). Recomendación: **posponer** hasta subir Node a 26 en CI; hoy generaría desalineación de tipos.
- `jsdom` 26.1.0 → 30.0.1 — histórico de romper la serialización de estilos de `@react-pdf` en tests (documentado en v7.29.1). Probar en rama aparte; si falla, mantener 26.

## Lote 4 — Mayores bloqueados

- `typescript` 5.9.3 → 7.0.2 — bloqueado por `typescript-eslint`; ya está ignorado en `.github/dependabot.yml`. No tocar.
- `react-dropzone` 16 → 20 — cuatro majors de salto poco después de la migración a v16; requiere sprint propio con verificación visual de `CsfDropzone`, `DragDropImageUploader` y `DamageEvidenceSection`.
- `@tanstack/react-table` 8 → 9 — el mayor esfuerzo: 15 archivos afectados, incluyendo el núcleo `useLiftgoTable`, virtualización, paginación y ordenamiento de `DataTableV2`. Amerita un sprint dedicado con pruebas de regresión de tablas y filtros.

## Detalles técnicos

- Ejecución por lotes con `bun add` explícito por paquete, no `ncu -u` masivo.
- Verificación tras cada lote: `tsgo --noEmit`, `bun run lint`, `bunx vitest run`, `bun run build`.
- Lote 2 añade además smoke visual de PDFs y de tablas.
- Cada lote se publica como su propia versión de changelog (parches = patch, menores = minor, mayores = major).

## Alcance propuesto para ejecutar ahora

Lotes 1 y 2 (14 paquetes, sin breaking changes esperados). Los lotes 3 y 4 se agendan como sprints separados.
