
# Auditoría e implementación React 19 + Compiler

## Estado actual (hallazgos)

Post-instalación del Compiler y de los sprints previos, el repo ya está en muy buena forma:

- `react@19` y `react-dom@19` con `babel-plugin-react-compiler@1.0.0` activo vía `@rolldown/plugin-babel` y `reactCompilerPreset({ target: "19" })`.
- **0** usos de `React.memo`, `forwardRef` (React 19 acepta `ref` como prop normal), `import * as React`, o `import React from "react"`.
- Solo **21** archivos con `useMemo/useCallback` (la mayoría legítimos en contexts/providers/hooks fuera del scope del Compiler).
- **11** archivos ya usan `<Activity>` para paneles/sheets.
- `useSyncExternalStore` y `useDeferredValue` ya adoptados donde suman.
- `useOptimisticStatus` existe como helper genérico pero solo se consume en `useFeedbackStatusUpdate`.

## Oportunidades reales

Cuatro focos concretos, todos low-risk:

### 1. Named imports para tipos de React (~37 archivos)

Todavía quedan referencias tipo `React.FC`, `React.ReactNode`, `React.ComponentProps`, `React.MouseEvent`, `React.KeyboardEvent`, `React.CSSProperties`, `React.Dispatch`, `React.SetStateAction`, etc. en ~37 archivos de `src/`.

**Por qué migrar**: consistencia con el resto del repo (ya migrado a named imports), habilita el `verbatimModuleSyntax` de TS más adelante, y facilita el tree-shaking cuando `@types/react` reexporta desde submódulos.

**Acción**: codemod (`sed`/regex acotado por archivo) que reemplaza cada `React.X` por el símbolo importado y ajusta el `import type { X } from "react"`. Además, eliminar `React.FC<Props>` en favor de `({ ... }: Props) => …` (patrón ya usado en el resto del repo).

### 2. Ampliar adopción de `useOptimisticStatus`

`src/hooks/useOptimisticStatus.ts` ya envuelve `useOptimistic` de React 19 pero solo lo consume feedback. Los siguientes flujos disparan un `updateStatus` seguido de una invalidación de query y son candidatos naturales:

- `features/bookings/hooks/useBookingActionsLogic.ts` + `BookingActions.tsx` (confirmar/cancelar/completar).
- `features/invoices/components/list/InvoicesToolbar.tsx` y acciones de detalle (marcar pagada, cancelar).
- `features/contracts/hooks/contractDetail/useContractDetailLogic.ts` (activar/rescindir).

**Ganancia**: feedback instantáneo en el badge de estatus antes de que la mutación de TanStack Query resuelva, con rollback automático si falla.

**Alcance sugerido**: sólo el badge/etiqueta visible en la fila o encabezado; no se toca la lógica de mutación ni la invalidación.

### 3. `useTransition` en filtros pesados de listas grandes

Hoy `useDeferredValue` cubre `useListFilters`. Para acciones explícitas que sí conocemos que son caras (cambio de vista Kanban↔Lista en Mantenimiento, cambio de agrupación en el Reporte P&L), envolver el `setState` en `startTransition` mantiene la UI responsiva sin diferir el valor.

Alcance: 2 puntos concretos, sin refactor global.

### 4. Limpieza fina

- `src/lib/ui/errorDetailsStore.ts`: revisar que el `useSyncExternalStore` no exponga un snapshot recreado por render (causa re-renders innecesarios post-Compiler).
- Confirmar que no queden `useCallback` sobre handlers inline que ya no aportan tras el Compiler; si el linter `react-compiler/react-compiler` no marca bail-out, dejarlos (el Compiler los omite).

## Fuera de alcance (decidido)

- **`use()` API para promesas**: TanStack Query cubre todo el estado async. Adoptar `use()` requeriría promesas suspendidas que hoy no existen; sin beneficio real.
- **`useActionState` / `useFormStatus`**: son para forms nativos con `<form action>`. Todo el repo usa RHF + Zod, mucho más potente para nuestro caso.
- **Más `<Suspense>` boundaries**: el router ya hace code-splitting y `RouteSkeletons` cubre cada ruta. Añadir boundaries granulares no aporta valor visible.
- **Server Components / SSR**: no aplica (SPA con Vite + RouterProvider).

## Entregables

1. Codemod de tipos (`React.X` → named imports) en los ~37 archivos.
2. Adopción de `useOptimisticStatus` en bookings, invoices y contratos (3 flujos).
3. `startTransition` en cambio de vista Kanban/Lista y grupo del P&L.
4. Revisión del snapshot en `errorDetailsStore`.
5. Validación: `tsgo --noEmit`, build de producción, suite de tests (997), sin nuevos warnings de `react-compiler/react-compiler` ni de `react-hooks/*`.
6. Entrada de changelog **v7.50.0** (minor: adopta APIs de React 19 de forma más consistente sin cambios funcionales visibles).

## Detalles técnicos

- Los `React.MouseEvent<HTMLButtonElement>` etc. se traducen a `MouseEvent<HTMLButtonElement>` con `import type { MouseEvent } from "react"`. Cuidado con colisiones con el `MouseEvent` global del DOM: se importa con alias `type ReactMouseEvent` cuando el archivo también usa el global.
- `React.FC<Props>` → firma explícita `({ … }: Props)` para no forzar `children` implícito.
- `useOptimistic` requiere que el componente que lo llama monte el `<Badge>` (no funciona a través de props stateless); el helper actual ya está preparado para eso.
- El React Compiler bail-out se verifica corriendo `bun lint` y buscando `react-compiler/react-compiler` en la salida.

## Estimación

~40 archivos tocados, cambios mecánicos + 3 adopciones puntuales. Sin migraciones de datos ni de dependencias.
