# Auditoría de actualización de librerías — 14 ago 2026 (v7.320.0)

Comparación de cada dependencia de `package.json` contra su última versión publicada.

## Aplicado en v7.320.0

### Parches
| Paquete | De | A |
| --- | --- | --- |
| `@tanstack/react-virtual` | 3.14.8 | 3.14.9 |
| `dompurify` | 3.4.12 | 3.4.13 |
| `marked` | 18.0.7 | 18.0.9 |
| `sonner` | 2.0.7 | 2.0.8 |
| `knip` (dev) | 6.32.0 | 6.32.2 |

### Menores
| Paquete | De | A | Nota |
| --- | --- | --- | --- |
| `@supabase/supabase-js` | 2.110.9 | 2.112.3 | — |
| `@sentry/react` | 10.68.0 | 10.70.0 | — |
| `react-hook-form` | 7.83.0 | 7.85.0 | subido junto con resolvers |
| `@hookform/resolvers` | 5.5.7 | 5.8.0 | wrapper `src/lib/forms/zodResolver.ts` sin cambios |
| `@react-pdf/renderer` | 4.5.1 | 4.6.1 | PDFs revalidados por tests |
| `lucide-react` | 1.27.0 | 1.31.0 | absorbido por el registry `src/components/icons` |
| `papaparse` | 5.5.4 | 5.6.0 | — |
| `typescript-eslint` (dev) | 8.66.0 | 8.67.0 | — |
| `rollup-plugin-visualizer` (dev) | 7.0.1 | 7.1.1 | — |

Verificación: `tsgo --noEmit` OK · `bun run lint` 0 warnings · `bunx vitest run` 1698/1698 · `bun run build` OK.

## Aplazado (mayores)

| Paquete | De | A | Motivo |
| --- | --- | --- | --- |
| `typescript` | 5.9.3 | 7.0.2 | Bloqueado por `typescript-eslint`; ya ignorado en `.github/dependabot.yml`. |
| `@tanstack/react-table` | 8.21.3 | 9.1.2 | 15 archivos afectados (núcleo `useLiftgoTable`, virtualización, paginación, ordenamiento de `DataTableV2`). Sprint dedicado con regresión de tablas y filtros. |
| `react-dropzone` | 16.0.0 | 20.1.0 | Cuatro majors de salto poco después de migrar a v16. Requiere verificación visual de `CsfDropzone`, `DragDropImageUploader` y `DamageEvidenceSection`. |
| `jsdom` (dev) | 26.1.0 | 30.0.1 | Histórico de romper la serialización de estilos de `@react-pdf` en tests (v7.29.1). Probar aislado. |
| `@types/node` (dev) | 24 | 26 | `.node-version` está en 24; subir tipos antes que el runtime desalinearía CI. |
| `@testing-library/jest-dom` (dev) | 6.9.1 | 7.0.1 | Solo tests; revisar matchers deprecados en un PR propio. |

## Criterio de ejecución

- Actualizar por lotes con `bun add` explícito, nunca `ncu -u` masivo.
- Verificación por lote: typecheck, lint, vitest, build.
- Cada lote genera su propia entrada de changelog.
