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

## Lote 3 — resultado (v7.320.1)

| Paquete | De | A | Resultado |
| --- | --- | --- | --- |
| `@testing-library/jest-dom` (dev) | 6.9.1 | 7.0.1 | **Aplicado.** Solo se usan `toBeInTheDocument` (109), `toBeDisabled` (5) y `toHaveTextContent` (2); todos siguen soportados en v7. |
| `jsdom` (dev) | 26.1.0 | 30.0.1 | **Descartado, se mantiene 26.1.0.** Confirma el histórico de v7.29.1: `documents.smoke.test.tsx` falla con `TypeError: 'set' on proxy: trap returned falsish for property '0'` en `setValueForStyle` de react-dom 19 al renderizar componentes de `@react-pdf`. 9 pruebas rojas. Reintentar cuando jsdom o react-dom corrijan la interacción con `CSSStyleDeclaration`. |
| `@types/node` (dev) | 24 | 26.2.0 | **Pospuesto.** `.node-version` = 24 y `engines.node` = `>=24`; subir tipos antes que el runtime desalinea CI. Condición para subir: mover Node a 26 en `.node-version` y en los workflows. |

Verificación del lote: `tsgo --noEmit` OK · `bun run lint` 0 warnings · `bunx vitest run` 1698/1698 · `bun run build` OK.
