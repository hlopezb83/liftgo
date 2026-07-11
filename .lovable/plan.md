# Auditoría lucide-react

## Estado actual

- **246 archivos** importan de `lucide-react`, con **133 íconos únicos**.
- **Bundle:** ~64 KB rendered / 45 KB gzip (chunk `icons`). Tree-shaking funciona correctamente vía ESM — no hay barrel import roto.
- **Config:** `vite.config.ts` ya aísla `lucide-react` en su propio `manualChunk`.
- **No hay** `DynamicIcon` ni imports desde `lucide-react/dynamic` (correcto: rompería tree-shaking).
- **No hay** wrapper `<Icon>` central ni registry semántico.

## Hallazgos


| #   | Sev  | Hallazgo                                                                                                                                                                                                                                                                                      | Riesgo                                                                                         |
| --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | HIGH | **Duplicados semánticos** en uso paralelo: `Check` (9) + `CheckCircle` (7) + `CheckCircle2` (11); `AlertTriangle` (20) + `AlertCircle` (9); `X` (14) + `XCircle` (10); `Pencil` (19) + posibles `Edit`/`Edit2`.                                                                               | Inconsistencia visual entre módulos para la misma acción.                                      |
| 2   | HIGH | **Tamaños hardcoded** sin escala: `h-4 w-4` (356), `h-3 w-3` (48), `h-5 w-5` (24), `h-7 w-7` (16), `h-8 w-8` (10), `h-6 w-6` (10), `h-10 w-10` (7), `h-12 w-12` (5), `h-14 w-14` (4), `h-9 w-9` (2)… Además mezclas incorrectas como `h-10 w-64`, `h-10 w-8`, `h-8 w-48` (ratio no-cuadrado). | Sin escala tipo `xs/sm/md/lg` cada dev inventa un tamaño; los ratios erróneos deforman íconos. |
| 3   | MED  | **246 imports directos** repartidos por todo el árbol, sin capa de abstracción. Cambiar el set de íconos o renombrar uno obliga a tocar N archivos.                                                                                                                                           | Fricción alta para futuros rebrands / migraciones.                                             |
| 4   | MED  | **Sin ESLint guard** que impida `import { Foo } from "lucide-react"` fuera de una capa central.                                                                                                                                                                                               | El drift semántico (hallazgo 1) se reproducirá.                                                |
| 5   | LOW  | `**strokeWidth` implícito** (default 2) — la memoria menciona estética "industrial minimalist"; no se aprovecha `strokeWidth={1.5}` para look premium.                                                                                                                                        | Consistencia visual no forzada.                                                                |
| 6   | LOW  | **Chunk `icons` separado** (~45 KB gzip). Split razonable, pero al ser un chunk chico podría fusionarse con `vendor` para reducir requests.                                                                                                                                                   | Optimización marginal.                                                                         |
| 7   | OK   | Tree-shaking, ESM, no dynamic loader, `sideEffects: false` upstream.                                                                                                                                                                                                                          | —                                                                                              |


## Veredicto

**No es "top of the line"**, pero tampoco está sucia: el runtime/bundle está bien; lo que falta es **capa semántica y disciplina**. La app es un buen candidato al patrón "lego" ya establecido en memoria (`ListToolbar`, `DetailLayout`, etc.).

## Plan propuesto (3 lotes)

### Lote 1 — Registry semántico + tokens de tamaño (alto impacto, bajo riesgo)

1. Crear `src/components/icons/index.ts` — **registry semántico** por acción/dominio, no por nombre lucide:
  ```ts
   export { Trash2 as DeleteIcon, Pencil as EditIcon,
            Plus as AddIcon, CheckCircle2 as SuccessIcon,
            AlertTriangle as WarnIcon, XCircle as ErrorIcon,
            Loader2 as SpinnerIcon, ... } from "lucide-react";
  ```
   Consolida los duplicados (hallazgo 1): un único ícono canónico por acción.
2. Crear `src/components/icons/Icon.tsx` — wrapper con **tokens de tamaño**:
  ```tsx
   type IconSize = "xs" | "sm" | "md" | "lg" | "xl";  // 12/16/20/24/32
   <Icon as={DeleteIcon} size="sm" />
  ```
   `strokeWidth` default `1.75` (premium industrial).
3. Codemod (jscodeshift o `sed` guiado): reemplazar los ~356 usos de `h-4 w-4` por `size="sm"` etc. Solo tocar `className` con patrones cuadrados; los no-cuadrados (`h-10 w-8`) se marcan para revisión manual.

### Lote 2 — ESLint guard + migración progresiva

4. Regla `no-restricted-imports` bloqueando `lucide-react` excepto en `src/components/icons/**`. Nuevos archivos obligados al registry.
5. Migrar módulos de mayor tráfico primero: `layouts/sidebar/*`, `components/ui/*`, dashboard, cotizaciones, reservas. Los 246 archivos se reducen gradualmente a imports desde `@/components/icons`.

### Lote 3 — Optimización de bundle (opcional)

6. Medir chunk `icons` post-consolidación (esperado -20% por dedupe). Evaluar fusionar con `vendor` si baja de 30 KB gzip.
7. Auditar íconos con **1 solo uso** (~40+ candidatos) — revisar si son reemplazables por el registry canónico.

## Métricas objetivo

- Íconos únicos: **133 → ≤ 90** (dedupe semántico).
- Imports directos de `lucide-react`: **246 → 0** fuera del registry.
- Tamaños hardcoded (`h-N w-N` en JSX): **~470 → ≤ 20** (edge cases).
- Bundle chunk `icons`: **45 KB gzip → ~35 KB gzip**.
- Warnings ESLint tras guard: **0**.

## Detalles técnicos

- **Sin cambio de dependencia** (`lucide-react` ^0.462.0 se queda).
- **Sin breaking changes** visuales si el codemod mapea tamaños con equivalencia 1:1 (`h-4 w-4` = `size="sm"` = 16px).
- Compatible con memoria "power of 10" (componentes ≤150 LOC — el wrapper `Icon.tsx` ~30 LOC).
- Compatible con DRY: `Icon` + registry son helpers canónicos nuevos.
- Changelog: `v7.9.0` (Lote 1), `v7.9.1` (Lote 2), `v7.9.2` (Lote 3).

¿Ejecutamos los 3 lotes en secuencia, o prefieres empezar sólo por el Lote 1 (registry + tokens) y evaluar antes de forzar el ESLint guard? ejecuta TODO.