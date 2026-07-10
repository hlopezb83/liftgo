# Migración a React 19 — Análisis y Plan

## Estado actual del proyecto
- React **18.3.1** + React DOM 18.3.1
- Vite 5 + `@vitejs/plugin-react-swc` 3.11 (compatible con R19 sin cambios)
- 34 archivos con `forwardRef` (todos son wrappers shadcn/ui)
- **0 usos de `defaultProps`** en componentes función (era el mayor breaking change)
- Sin string refs, sin `PropTypes`, sin `ReactDOM.render` legacy
- Librerías clave ya soportan R19: `@tanstack/react-query` 5, Radix UI (todas ≥1.2), `react-hook-form` 7.80, `react-router-dom` 6.30, `sonner` 1.7, `recharts` 3, `cmdk` 1.1

## Complejidad estimada: **BAJA** (1–2 sesiones)
No hay bloqueadores. Los breaking changes reales de R19 no aplican aquí:
- ❌ No usamos `propTypes` / `defaultProps` en function components
- ❌ No usamos string refs ni `React.createFactory`
- ❌ No usamos `ReactDOM.render` / `hydrate` (usamos `createRoot`)
- ⚠️ Único cambio de tipos: `ref` deja de necesitar `forwardRef` (opcional refactor)
- ⚠️ Cambios de tipos en `@types/react` 19 (algunos hijos ahora más estrictos, `useRef` requiere argumento inicial)

## Beneficios concretos para LiftGo

### Ganancias inmediatas (sin refactor)
1. **Mejores errores de hidratación** — diffs claros en consola (útil en el portal de clientes).
2. **Document metadata nativo** — `<title>` y `<meta>` desde componentes; sustituye parches ad-hoc de SEO.
3. **Precarga de recursos** — `preload`, `preinit` para PDFs (jsPDF lazy) y fuentes.
4. **Stack traces más limpios** en errores capturados por `sonner`.

### Ganancias tras refactor selectivo (opcional, gradual)
5. **`useOptimistic`** — encaja perfecto con la memoria `optimistic-ui` del proyecto (eliminaciones inmediatas con rollback); podría reemplazar patrones manuales en mutaciones.
6. **`useActionState` + `<form action={}>`** — simplifica flujos RHF que hoy usan `isPending` + `onSubmit` manual (Bookings, Quotes, Invoices).
7. **`ref` como prop** — permite eliminar `forwardRef` en los ~34 wrappers de shadcn/ui (reducción DRY natural).
8. **`use()` hook** — leer contextos condicionalmente (útil en `MainLayout` para permisos por rol).

### NO aplica
- Server Components / Server Actions (somos SPA Vite, no Next).
- React Compiler es independiente de R19 (se puede activar por separado en R18 también).

## Plan de migración por fases

### Fase 1 — Bump y verificación (~1 h)
1. `bun add react@^19 react-dom@^19` y `bun add -D @types/react@^19 @types/react-dom@^19`.
2. Ejecutar codemod oficial de tipos:
   `bunx types-react-codemod@latest preset-19 ./src`
   (arregla `useRef` sin argumento, `ReactElement` genéricos, etc.)
3. `bunx tsgo` → resolver errores de tipos que resulten (esperamos <10, mayormente en refs y `children`).
4. `bunx vitest run` → suite 804 tests debe seguir verde.
5. Smoke test manual: login, dashboard, crear reserva, generar PDF, portal de clientes.

### Fase 2 — Validación runtime (~30 min)
6. Verificar consola sin nuevos warnings en las rutas críticas (Bookings, Quotes, Invoices, Portal, Maintenance).
7. Comprobar que Radix, `cmdk` y `recharts` renderizan sin regresiones.
8. Publicar changelog `v6.152.0` (minor, no breaking para el usuario final).

### Fase 3 — Aprovechar novedades (opcional, siguientes sprints)
9. Migrar wrappers de shadcn/ui: eliminar `forwardRef` en los 34 archivos (−~60 LOC, cuadra con el sprint DRY).
10. Introducir `useOptimistic` en los hooks de eliminación optimista existentes.
11. Reemplazar tags manuales de `<title>`/meta por soporte nativo de R19 en rutas SEO.

## Riesgos y mitigación
- **Tipos más estrictos en `children`** → algunas props `ReactNode` pueden requerir cast. Se resuelve con el codemod + ajustes puntuales.
- **`useRef()` sin argumento inicial** → ahora obliga a pasar `null`. El codemod lo hace automáticamente.
- **Radix / cmdk peer deps** → todos ya declaran `react: ">=16 || 17 || 18 || 19"` en sus últimas versiones instaladas. Sin acción requerida.
- **Rollback trivial** → volver a `react@18.3.1` con un `bun add` si algo crítico aparece.

## Recomendación
Ejecutar **Fase 1 + 2** en una sola sesión (bajo riesgo, alto valor por mejores errores + metadata nativo + desbloquea R19 APIs). Dejar Fase 3 como parte del sprint DRY en curso — encaja naturalmente con los objetivos de reducción de LOC.

¿Procedemos con Fase 1+2 ahora, o prefieres incluir también la Fase 3 (limpieza de `forwardRef`) en el mismo cambio?
