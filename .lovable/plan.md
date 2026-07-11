# Auditoría de React — Estado actual

**Versión:** `react@19.2.7` (última estable, publicada oct-2025). `react-dom@19`, `@types/react@19`. ✅ Al día.

## Fortalezas

- `StrictMode` activo en `main.tsx`.
- `ErrorBoundary` global + `RouteErrorBoundary` por ruta con `key={pathname}` (reset correcto al navegar).
- `Suspense` con `lazy()` en `App.tsx`, `AuthGuard`, `CustomerPortalRoutes` — code-splitting bien aplicado.
- Manejo de `vite:preloadError` para chunks stale (patrón moderno).
- TanStack Query, RHF + Zod, Radix/shadcn — stack canónico.
- Reglas ESLint de hooks activas, 0 warnings.

## Brechas vs. "top of the line" React 19

Cinco puntos concretos, ordenados por impacto:

### 1. `forwardRef` obsoleto en 34 archivos
En React 19 `ref` es una prop normal en componentes de función. Todos los primitivos shadcn/ui (`button.tsx`, `card.tsx`, `input.tsx`, `dialog.tsx`, `form.tsx`, `tabs.tsx`, `chart.tsx`, `toggle-group.tsx`, ~26 más) siguen envueltos en `React.forwardRef`. Eliminarlo:
- Reduce ~1 nivel de indirección por primitivo (mejor stack traces).
- Simplifica tipos (`ComponentProps<'button'> & { ref?: Ref<HTMLButtonElement> }`).
- ~150–200 LOC menos.

### 2. Cero adopción de APIs nuevas de React 19 / 18
`rg` no encuentra ni un uso de: `useTransition`, `useDeferredValue`, `useOptimistic`, `useActionState`, `useFormStatus`, `use()`. Oportunidades reales:
- **`useDeferredValue`** en barras de búsqueda de listados grandes (Facturas, Reservas, Clientes, Inventario) — desacopla el input del filtrado pesado sin debounce manual.
- **`useTransition`** para cambios de tab/filtros que remontan tablas virtualizadas.
- **`useOptimistic`** en mutaciones de estado corto (marcar leído, cambiar status kanban) complementando TanStack Query en UI local.
- **`use(promise)`** para lecturas suspendibles en detalles ya envueltos por `Suspense` (opcional, requiere refactor de fetchers).

### 3. React Compiler no instalado
`babel-plugin-react-compiler` (RC estable con React 19.2) memoriza componentes/hooks automáticamente. Impacto esperado:
- Elimina la necesidad de la mayoría de los `useMemo`/`useCallback` manuales (~600 usos en el repo).
- Reduce re-renders sin cambiar código de aplicación.
- Compatible con Vite vía `vite-plugin-react` + opción `babel.plugins`.
Riesgo: requiere que el código cumpla las Reglas de React (el linter `eslint-plugin-react-compiler` ya identifica violaciones; hay que correrlo primero en modo advertencia).

### 4. `useEffect` sobre-usado (596 matches en 201 archivos)
Sample de auditoría muestra tres anti-patrones recurrentes:
- **Sincronizar estado derivado** (`useEffect(() => setX(deriveFromProps()), [props])`) — debería ser cálculo directo en el render o `useMemo`.
- **`form.reset` dentro de effects** cuando el ID cambia — patrón React 19 preferido: `key={id}` para remount, o `useEffect` con guard mínimo.
- **Effects que despachan side-effects que son en realidad event handlers** (ej. abrir dialog al cambiar prop) — deben moverse al handler que causa el cambio.
No es urgente pero da fruta madura al pasar módulo por módulo.

### 5. `<Context.Provider>` legado
Todos los providers (`PageActionsProvider`, `AuthContext`, `ConfirmProvider`, etc.) usan `<Context.Provider value={...}>`. En React 19 puedes renderizar `<Context value={...}>` directamente. Cosmético pero es el patrón nuevo.

## Plan propuesto (4 lotes, ordenados por ROI)

### Lote 1 — Eliminar `forwardRef` en primitivos shadcn/ui
- 34 archivos en `src/components/ui/*` + `src/components/feedback/EmptyRow.tsx`.
- Reemplazar `React.forwardRef<T, P>((props, ref) => …)` por función que recibe `ref` como prop.
- Actualizar `displayName` (o eliminarlo cuando no aporte).
- Verificar consumidores que hagan `React.ElementRef<typeof Button>` — sigue funcionando.
- Salida: `-150/200 LOC`, tests verdes, `tsgo` OK.

### Lote 2 — Habilitar React Compiler
1. Instalar `babel-plugin-react-compiler` + `eslint-plugin-react-compiler`.
2. Añadir la regla ESLint en modo `warn`, correr y catalogar violaciones (esperado: bajo, código ya cumple Rules of Hooks).
3. Enchufar el plugin en `vite.config.ts` bajo `react({ babel: { plugins: [...] } })`.
4. Medir bundle y correr suite completa (913 tests).
5. Documentar en `mem://tech/stack` y changelog.

### Lote 3 — Adopción selectiva de APIs 19
- `useDeferredValue` en 4 listados de alto volumen (Facturas, Reservas, Clientes, Inventario). Reemplaza `useDebouncedValue` donde aplique.
- `useOptimistic` en cambios de status del kanban de Mantenimiento y de Feedback.
- `useTransition` para toggles de filtros que remontan `DataTableV2` virtualizado.
- Sin refactor masivo; solo casos con beneficio medible.

### Lote 4 — Higiene de `useEffect` + Context
- Barrido dirigido: identificar los 20–30 `useEffect` que son estado derivado y convertirlos a `useMemo` o cálculo inline.
- Reemplazar `<Context.Provider>` → `<Context>` en los ~10 providers.
- Reglas ESLint recomendadas: `react-hooks/exhaustive-deps` ya activa; añadir `react-you-might-not-need-an-effect` (opcional) para señalar candidatos.

## Verificación por lote
`tsgo` · `bunx vitest run` (913 tests) · `bun run lint` (0 warnings) · smoke test manual del preview · changelog `v7.12.0` → `v7.15.0`.

## No cambia
- Router, TanStack Query, Zod, Radix, Tailwind, shadcn API pública, layouts, features de negocio.
- Sin migración a Server Components (no aplica en Vite SPA).
