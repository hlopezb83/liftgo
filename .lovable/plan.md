# Fix ESLint error and warnings

## Diagnóstico

El CI está rojo por **1 error de ESLint** (bloqueante). Además hay **99 warnings** distribuidos en muchos archivos.

- Vitest: 1003/1003 ✅
- Typecheck: ✅
- Build: ✅
- E2E: ✅
- **ESLint: ✖ 100 problems (1 error, 99 warnings)** ← rompe CI

### El error (bloqueante)

`src/hooks/usePullToRefresh.ts:58` — `no-useless-assignment`:

```ts
if (first && target.scrollTop > 0) {
  canceled = true;   // ← inútil: es una variable local destructurada, no cancela nada
  return;
}
```

`canceled` viene del state destructurado de `useDrag`; reasignarlo no cancela el gesto. Para cancelar hay que usar `cancel()` (también expuesto por el state) o simplemente hacer `return`. Como ya hacemos `return` en la misma línea, la asignación es puro ruido.

### Fix del error

En `src/hooks/usePullToRefresh.ts`:

1. Línea 53: quitar `canceled` de la desestructuración cuando no se use, y añadir `cancel` para poder cancelar el gesto correctamente al inicio.
2. Línea 57-60: reemplazar `canceled = true` por `cancel()` antes del `return`, para que use-gesture realmente marque el gesto como cancelado en la fase final.
3. Línea 78: mantener `canceled` en la desestructuración (sí se lee para decidir el trigger).

Resultado: mismo comportamiento observable, sin asignación inútil.

### Warning en el mismo archivo

Línea 2 — `import-x/order`: swap del orden de imports:

```ts
import { useDrag } from "@use-gesture/react";
import { useCallback, useMemo, useRef, useState } from "react";
```

## Alcance propuesto

Los otros 98 warnings son **no-bloqueantes** (CI falla solo por errors) y abarcan decenas de archivos: `import-x/order`, `react-hooks-extra`, react-compiler hints, `jsx-a11y/no-autofocus`, etc. Deuda incremental ya tolerada por el proyecto (memoria: "216 → 51 warnings restantes son deuda incremental, no bloquean build" — ahora reaparecieron algunas al agregar dependencias en Lotes E-G).

Recomendación: en este cambio arreglamos **solo el error + su warning hermano** (misma pieza tocada en v7.61.0). El CI vuelve a verde. Los 98 warnings restantes los podemos abordar en un sprint dedicado si querés.

## Cambios

- `src/hooks/usePullToRefresh.ts` — reemplazar `canceled = true` por `cancel()`, reordenar imports.
- `public/changelog.json` + `public/changelog/v7.61.6.json` — entrada patch "CI: fix eslint error no-useless-assignment en usePullToRefresh".

## Pregunta

¿Procedo con este alcance (error + warning del mismo archivo), o querés que ataque los 99 warnings completos en este mismo cambio?
