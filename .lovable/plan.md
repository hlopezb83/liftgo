# Auditoría Ola 3.b (v7.114.5) + Sprint Ola 4

## Estado actual (verificado)

- **Changelog**: 465 entradas, 0 duplicados, top-6 en orden descendente correcto tras hotfix v7.114.6. ✅
- **Archivos de detalle**: `v7.114.0` a `v7.114.6` presentes. ✅
- **ESLint**: **0 errores, 49 warnings** (bajaron desde 72 pre-Ola-3.b; hotfix agregó ~2 líneas benignas).
- **Tests**: 1083 Vitest verdes reportados en v7.114.5. Sin cambios de lógica desde entonces (solo JSON).

**Diagnóstico**: Ola 3.b está estable. No hay bugs detectados y no requiere tests adicionales (los refactors fueron equivalencia semántica cubiertos por la suite existente). Verde para continuar.

## Distribución de los 49 warnings restantes

| Regla | # | Estrategia |
|---|---|---|
| `react-refresh/only-export-components` | 9 | Extraer exports no-componente a archivos hermanos (`*.constants.ts`, `*.helpers.ts`) |
| `react-hooks/set-state-in-effect` | 7 | Casos residuales complejos que quedaron pendientes en Ola 3.b |
| `react-hooks/incompatible-library` | 6 | Aislar libs incompatibles con Compiler (marcar con `"use no memo"` puntual) |
| `max-lines-per-function` | 6 | Extraer sub-componentes/hooks en páginas grandes |
| `complexity` | 3 | Descomponer funciones ≥16 en helpers |
| `react-compiler/react-compiler` | 2 | Consecuencia de disables — se resuelve al arreglar la causa raíz |
| `no-restricted-imports` (`useNavigate`) | 2 | Migrar a `useNavigateTransition` |
| `react-hooks/refs`, `purity`, `static-components` | 3 | Casos individuales de patrón |
| `import-x/order`, `max-lines` (301) | 2 | Autofix + split archivo |

## Plan del sprint

### Ola 4.a — Quick wins (batch autofix + triviales) → objetivo −12 warnings
1. Autofix de `import-x/order` y demás fixables.
2. Migrar los 2 `useNavigate` → `useNavigateTransition`.
3. Resolver el warning único de `react-hooks/refs` y el de `purity` (probablemente `Date.now()`/`Math.random()` en render → mover a effect o `useState` lazy init).

### Ola 4.b — react-refresh (9 warnings) → objetivo −9
- Identificar los 9 archivos con exports mixtos (contextos, constantes o utilidades exportadas junto al componente).
- Extraer cada export no-componente a un archivo hermano (`Foo.constants.ts` / `Foo.context.ts` / `useFoo.ts`).
- Actualizar imports de consumidores.

### Ola 4.c — set-state-in-effect residual (7 warnings) → objetivo −7
- Aplicar el patrón "adjust state during render" con `useState` guard donde la complejidad lo permita.
- Donde el guard rompa el umbral de complejidad, usar `useMemo` derivation.
- Como último recurso, `eslint-disable-next-line` con comentario justificado (patrones RHF `form.reset`, listeners externos).

### Ola 4.d — incompatible-library + compiler (8 warnings) → objetivo −8
- Identificar las 6 líneas con `Compilation Skipped: Use of incompatible library` (típicamente adaptadores de libs externas).
- Envolver esos componentes/hooks con la directiva `"use no memo"` de React Compiler.
- Verificar que los 2 warnings `react-compiler/react-compiler` desaparezcan como efecto colateral.

### Ola 4.e — Complejidad y tamaño (9 warnings) → objetivo −9
- 6× `max-lines-per-function`: extraer sub-componentes puros (headers, filas de tabla, secciones de formulario) en `AuditTrailPage`, `BankStatementImportsHistoryPage`, `MrrDetailPage`, `PaymentIntentsSection`, `InvoiceForm`, `useTableFilters`.
- 3× `complexity` (16/17/18): dividir en funciones auxiliares por rama (early returns).
- 1× `max-lines: 301`: split del archivo (probablemente `useTableFilters.ts`).

## Meta del sprint
**49 → 0–5 warnings** en 5 sub-olas incrementales. Cada sub-ola cierra con:
- `bunx eslint . 2>&1 | tail -3` (delta de warnings)
- `bunx vitest run` (1083 tests verdes)
- Entrada en `public/changelog.json` + detalle `v7.114.7.json`, `v7.114.8.json`, etc.

## Ejecución inmediata
Arranco **Ola 4.a** (quick wins) tras aprobar el plan.
