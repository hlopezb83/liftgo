## Auditoría de React (v19.2)

### Estado actual

- `react@^19` + `react-dom@^19` con JSX runtime automático.
- **Ya adoptado**: `useEffectEvent` (usePrefillEffect, SearchBar), `useOptimistic` + `startTransition` (feedback), `useTransition` (GlobalSearch), `useDeferredValue` (useListFilters), `<Activity>` (8 detail sheets), `React.lazy` + `Suspense` (rutas y portal), `useId` (form/chart).
- `**eslint-plugin-react-compiler**` habilitado como `warn`, pero el compiler NO corre en build — `vite.config.ts` deja el preset "pendiente". Toda memoización sigue siendo manual.
- **Sin `forwardRef`, `React.FC`, `defaultProps`, `propTypes`, `class components**` → ya en patrón moderno.

### Hallazgos

**CRITICAL / HIGH**

1. **React Compiler no está activo en build** — solo linter. `vite.config.ts` documenta explícitamente que `babel-plugin-react-compiler + @vitejs/plugin-react` queda pendiente por incompatibilidad con `rolldown-vite`.
  - Impacto: 26 archivos usan `useCallback`/`useMemo` manuales que el compiler eliminaría.
  - Fix: agregar `babel-plugin-react-compiler` al `plugins` de `@vitejs/plugin-react` con target `19` (ver "Detalles técnicos").
2. **35 archivos `shadcn/ui` usan `import * as React**` — namespace import obliga a bundlear todo el módulo sin tree-shaking selectivo y contradice la guía de React 19 ("import only what you use").
  - Fix: convertir a imports nombrados (`import { forwardRef, ComponentProps } from "react"`) o tipos separados. shadcn/ui oficial ya emite el patrón nombrado.
3. `**import React from "react"**` en `src/components/feedback/EmptyRow.tsx` + 9 tests. Con JSX runtime automático es innecesario y el linter `react/jsx-uses-react` ya está off.
  - Fix: reemplazar por `import type { Ref } from "react"` en EmptyRow; borrar el default import en tests (no se usa la referencia `React`, solo aparece por hábito).

**HIGH**

4. **useOptimistic infrautilizado** — solo en `useFeedbackStatusUpdate`. Los mismos flujos de "cambio de status con mutación async" existen en:
  - `useCRMPageDialogs` (prospect stage kanban)
  - `useBookingActions` (confirm/cancel booking)
  - `useMaintenanceKanban` (drag entre columnas)
  - Fix: extraer `useOptimisticStatus<TStatus>(current, mutate)` a `src/hooks/useOptimisticStatus.ts` y adoptar en los 3 flujos. Elimina el flicker de espera del optimistic manual actual con `queryClient.setQueryData`.
5. `**use()` hook no adoptado para contexts condicionales** — `useConfirm`, `useAuth`, `useSidebar` fuerzan `useContext` incluso dentro de branches. React 19 permite `use(Context)` dentro de condicionales.
  - Impacto bajo pero mejora legibilidad en `ConfirmProvider` y `AuthContext` cuando se lee context solo si un modal está abierto.

**MEDIUM**

6. `**useTransition` no usado en filtros pesados**. `useListFilters` ya usa `useDeferredValue`, pero cambios de filtro (status/tipo) siguen sin transition. Envolver los `setStatusFilter` en `startTransition` marca la UI como "urgente vs. transición" y baja LCP percibido en tablas grandes.
7. `**useSyncExternalStore` candidato para `useDialogState` global** — actualmente los hooks Zustand-like usan `useState` en providers. Para el portal cache o suscripciones a `window` events (`useMediaQuery`, `useOnlineStatus`) `useSyncExternalStore` da SSR-safe + tearing-free.

**OK / no tocar**

- `useEffectEvent` bien empleado (React 19.2).
- `Activity` adoptado.
- Rutas ya lazy.
- Sin `forwardRef` (React 19 acepta `ref` como prop plana).

---

### Plan de ejecución

**Fase A — Modernización de imports** (bajo riesgo, alto impacto de tree-shaking)

- Reemplazar `import * as React` en `src/components/ui/**` por imports nombrados.
- Eliminar `import React from "react"` residual en tests y `EmptyRow`.

**Fase B — Activar React Compiler en build**

- Añadir `babel-plugin-react-compiler` a `plugins: [react({ babel: { plugins: [["babel-plugin-react-compiler", { target: "19" }]] } })]`.
- Verificar con `bun run build` y una corrida de `bunx tsgo --noEmit`.
- Auditar visualmente la app para descartar bail-outs regresivos.

**Fase C — Adoptar `useOptimistic` compartido**

- Crear `src/hooks/useOptimisticStatus.ts` (genérico).
- Migrar prospect stage (kanban CRM), booking status, maintenance kanban.

**Fase D — Micro-optimizaciones**

- `startTransition` para filtros no-urgentes en tablas grandes (CustomersPage, ForkliftsPage).
- `use(Context)` donde hoy hay ramas condicionales de `useContext`.

**Fase E — Cleanup post-compiler** (después de Fase B en verde)

- Retirar `useCallback`/`useMemo` marcados por `react-compiler/react-compiler` como redundantes en 26 archivos.
- Objetivo: -300 LOC.

---

### Detalles técnicos

Compiler config sugerida:

```ts
// vite.config.ts
plugins: [
  react({
    babel: {
      plugins: [["babel-plugin-react-compiler", { target: "19" }]],
    },
  }),
  ...
]
```

Hook genérico propuesto:

```ts
// src/hooks/useOptimisticStatus.ts
export function useOptimisticStatus<T extends string>(
  current: T,
  mutate: (next: T) => Promise<void>,
) {
  const [optimistic, apply] = useOptimistic(current, (_, next: T) => next);
  const setStatus = (next: T) =>
    startTransition(async () => {
      apply(next);
      await mutate(next);
    });
  return [optimistic, setStatus] as const;
}
```

### Changelog

Al terminar cada fase se agrega entrada a `public/changelog.json` + `public/changelog/vX.Y.Z.json` (minor por cada fase).

### Fuera de alcance

- Migración a Server Components / Server Actions (requiere Next.js).
- Reescribir formularios con `useActionState` (RHF ya cubre el flujo).
- `renderToPipeableStream` / streaming SSR (proyecto es SPA).

¿Autorizas ejecutar de A → E secuencialmente, o prefieres empezar por una fase específica (recomiendo A + B primero: máximo impacto, mínimo riesgo)? Lo hacemos todo en secuencia. 