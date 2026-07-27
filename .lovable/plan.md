Corrige los avisos del CI (1 error Knip + 8 warnings ESLint) sin cambiar comportamiento de la app. Bump a v7.236.5.

## 1. Knip (error — bloquea el job)

- **`tests/e2e/roles-matrix.spec.ts:117`** — `import("/src/integrations/supabase/client.ts")` dentro de `page.evaluate` es una ruta runtime del navegador, no un import de bundler. Añadir esa ruta a `ignoreDependencies`/`ignore` de Knip (o marcar el import con un comentario `knip-ignore`) para que deje de reportarse como unresolved. No se toca el test.
- **`src/features/cash-flow/lib/queryKeys.ts:20`** — `cashFlowSettingsQueries` no se usa: eliminar el export (o hacerlo interno) tras confirmar `rg` que nadie lo consume.
- **`src/features/fleet/hooks/forklifts/useFleetLocations.ts:50`** — `fleetLocationsKey` sin consumidores: mismo tratamiento.

## 2. ESLint (8 warnings, cero cambio funcional)

- **`SidebarNavSection.tsx:87`** — Reemplazar el `// eslint-disable-next-line react-hooks/exhaustive-deps` en el `useEffect` de auto-scroll por una dependencia real (`[isActive]`) para no desactivar la regla y no romper React Compiler.
- **`SidebarNavSection.tsx:13`** — Reordenar imports: `./useSidebarBadgeCounts` antes del `type` import de `./navConfig`.
- **`CustomerSelector.tsx:105`** — El "botón limpiar" es un `<span role="button">` con `onClick`. Convertirlo en `<button type="button">` real (mismo styling) para satisfacer a11y sin cambiar UX.
- **`CustomerSelector.tsx:41`** — Complejidad 16. Extraer 2 helpers pequeños (`buildTriggerLabel(selected, required)` y `handleSelect`/`handleClear` a un hook `useCustomerSelection`) para bajar de 15 sin tocar el render.
- **`CalendarPage.tsx:3`** — Quitar la línea en blanco entre grupos de import.
- **`DeleteAuditLogDialog.tsx:7`** y **`AuditLogDetailDialog.tsx:6`** — Reordenar: `../../lib/queryKeys` antes de los imports relativos hermanos.
- **`buildPaymentsXlsx.ts:5`** — Mover el `type import` de `@e965/xlsx` después del import de `@/lib/utils`.

## 3. Verificación

- `bunx knip` → 0 unresolved / 0 unused.
- `bunx eslint <archivos tocados>` → 0 warnings en cada uno.
- `bunx vitest run` para asegurar que los renombres/limpieza no rompan tests.
- E2E ya venía en verde (29 + 35 passed); no se tocan specs.

## 4. Registro

- Bump `package.json` + `public/version.json` a **7.236.5**.
- Nueva entrada en `public/changelog.json` (patch, category `chore`): "CI · limpieza de warnings ESLint y unused exports (Knip)".

## Notas técnicas

- Ninguna migración de BD, ningún cambio de dependencias.
- Todos los cambios son a nivel de imports / a11y / extracción menor de helpers → no cambian rutas, contratos ni datos.
- Riesgo bajo: si el `<button>` real en `CustomerSelector` heredara padding distinto, mantendría las mismas clases Tailwind (`rounded-sm p-0.5 opacity-60 hover:bg-muted hover:opacity-100`) para conservar el look.
