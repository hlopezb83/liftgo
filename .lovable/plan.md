## Auditoría React — Estado actual

**TL;DR:** La implementación está en la cresta de la ola. React `19.2.7` (última), Compiler activo sin bailouts, 0 `forwardRef`, 0 `memo()` manuales, adopción real de `useTransition`, `useDeferredValue`, `useOptimistic`, `useEffectEvent` y `<Activity>`. El código es limpio y moderno. Lo que queda son *upgrades de siguiente nivel*, no fixes.

### Métricas verificadas

- `react` / `react-dom`: **19.2.7** (última publicada)
- `@vitejs/plugin-react@4` + `babel-plugin-react-compiler@1.0.0` con `{ target: "19" }`
- Compiler bailouts detectados: **2 warnings** (1 en `useListFilters.ts:92`, 1 en test)
- Hooks: 77 `useEffect`, 193 `useState`, **122 `useMemo**`, **64 `useCallback**`, 30 usos combinados de APIs React 19 (`useTransition` / `useDeferredValue` / `useOptimistic` / `useEffectEvent` / `<Activity>`)
- `React.lazy`: 68 rutas / componentes
- `<Suspense>`: solo **6 boundaries** en toda la app para 68 chunks lazy
- `memo()` manual: **0** · `forwardRef`: **0** ✓
- `react-router-dom`: **6.30.4** (v7.18.1 disponible)
- Cero uso de: Server Components, Actions (`useActionState`/`useFormStatus`), Document Metadata nativo (`<title>` en componentes), `use()` hook, `preload`/`preinit` de `react-dom`

### Diagnóstico por dimensión


| Dimensión                       | Estado            | Nota                                                               |
| ------------------------------- | ----------------- | ------------------------------------------------------------------ |
| Versión React                   | ✅ Top             | 19.2.7, sin ventaja al esperar                                     |
| React Compiler                  | ✅ Top             | Activo, 0 bailouts críticos                                        |
| Memoización manual              | ✅ Top             | Sin `memo`, sin `forwardRef`                                       |
| APIs de concurrencia            | 🟡 Alto           | Buen arranque; podemos ampliar                                     |
| Suspense granular               | 🟡 Medio          | 6 boundaries para 68 lazy → skeletons genéricos                    |
| Form Actions React 19           | 🔴 No adoptado    | RHF cubre casi todo, pero flujos server-async se benefician        |
| Document Metadata nativo        | 🔴 No adoptado    | Podría reemplazar wrappers ad-hoc de SEO                           |
| Router                          | 🟡 v6 estable     | v7 disponible, migración es cambio de imports + loaders opcionales |
| Higiene `useMemo`/`useCallback` | 🟡 Sobreabundante | Compiler ya memoiza; 122+64 son mayoría redundantes                |


---

## Plan sugerido — Fase F: "Post-Compiler cleanup"

### Lote 1 — Cerrar bailouts pendientes (10 min)

- `src/hooks/useListFilters.ts:92` — quitar el `eslint-disable` que desactiva reglas de React y bloquea la memoización del Compiler en ese hook (usado por todos los listados).
- `src/lib/ui/__tests__/AuthQueryCacheSync.test.tsx:20` — corregir la reasignación de variable externa (patrón anti-puro).

### Lote 2 — Poda de `useMemo`/`useCallback` redundantes (auditoría dirigida)

- Con el Compiler activo, la mayoría de los 186 (122 + 64) son *no-ops caros de leer*.
- Criterio de conservación:
  - Mantener si el resultado se usa como **dependency** de otro hook / effect (identidad estable importa).
  - Mantener si envuelve un cálculo verdaderamente costoso (>1 ms, e.g. `formatMoney` en 500 filas).
  - **Podar** en el resto.
- Objetivo: reducir ≥ 40 % (≈ 75 sitios), medido con `rg -c`.

### Lote 3 — `<Suspense>` granular por ruta

- Hoy solo 6 boundaries cubren 68 chunks. Un chunk lento congela **toda** la ruta padre.
- Añadir `<Suspense fallback={<SkeletonRoute />}>` **por ruta** en `App.tsx` (o en cada `MainLayout` outlet), con skeletons semánticos: `SkeletonTable`, `SkeletonForm`, `SkeletonDetail` — reutilizables.
- Beneficio: la navegación con `useNavigateTransition` ya vive en `startTransition`; sumar boundaries hace que el header/sidebar sigan interactivos con un placeholder localizado.

### Lote 4 — Document Metadata nativo React 19

- React 19 hoistea `<title>`, `<meta>`, `<link rel="canonical">` renderizados dentro de cualquier componente al `<head>`.
- Reemplazar el patrón actual (mutación manual de `document.title` o hooks tipo `usePageTitle`) por JSX declarativo en cada página.
- SEO consistente + testeable + zero-dep (elimina cualquier dependencia externa de helmet si la hubiese).

### Lote 5 — Evaluar migración a React Router v7

- v7 es v6 renombrado + Data APIs opcionales (loaders, actions, defer). Migración = actualizar imports (`react-router-dom` → `react-router`) y cambios menores.
- **Beneficio real**: `<Route loader>` deja precargar queries de TanStack en paralelo con la descarga del chunk lazy (elimina el "cargar chunk → después empezar fetch").
- Riesgo: superficie amplia (30+ rutas). Recomendación → **spike** en `/reports` y `/calendar` (rutas más pesadas) antes de propagar.

### Lote 6 — Adopción selectiva de React 19 Actions

- Candidatos: flujos server-first no cubiertos por TanStack Query (subida CFDI XML, generación PDF batch, importadores CSV).
- Envolver el handler en `useActionState`, usar `<form action={action}>` + `useFormStatus` para pending nativo.
- No migrar RHF — RHF sigue siendo mejor para formularios ricos con validación Zod.

### Lote 7 — `preload`/`preinit` de `react-dom` para assets críticos

- En rutas conocidas por consumir react-pdf (1.4 MB) o xlsx (331 kB), disparar `preload('/chunk.js', { as: 'script' })` al hover / `mouseenter` del CTA que abre la ruta.
- Combinado con Router loaders (Lote 5), elimina el "clic → esperar chunk".

---

## Alcance del sprint — te propongo elegir

- **Opción A · Cleanup rápido (Lotes 1 + 2):** 1 sesión, bajo riesgo, ganancia = menos ruido lint + código más legible.
- **Opción B · UX percibida (Lotes 1 + 3 + 4):** 1-2 sesiones, medio riesgo, ganancia = navegación con skeletons localizados + SEO nativo.
- **Opción C · Todo Fase F (Lotes 1-4 + spike de Lote 5):** 3-4 sesiones, riesgo controlado, deja la base lista para Actions + Router v7.
- **Opción D · Solo el spike de Router v7 (Lote 5):** exploratorio; decide si vale migrar el resto después.

Dime qué opción disparo y arranco. Si quieres otra combinación, indícalo.

&nbsp;

Continua con todo