# Plan: Migración de LiftGo a TanStack Start

## Contexto y recomendación

LiftGo es elegible para la migración (stack clásico Vite + React Router). La migración es mayormente automatizada, reversible desde el historial del chat, y el preview sigue mostrando la app actual durante todo el proceso.

**Recomendación previa**: migrar por longevidad de plataforma (Lovable evoluciona sobre TanStack Start), no por beneficios inmediatos — al ser un ERP tras login, el SSR no aporta SEO. Riesgos principales de este proyecto: ~58 rutas con guards anidados, activación de TypeScript strict (ola de errores de tipos a absorber), y re-cableado de la suite de Vitest.

## Qué haría la migración (resumen no técnico)

1. **Preflight**: verificar que el build actual está verde. Si falla, se detiene sin tocar nada.
2. **Intercambio de andamiaje**: nuevo `vite.config.ts`, `tsconfig.json` (strict), `package.json` fusionado (se conservan tus scripts `test`, `test:rls`, `gen:types`, etc. y se revisan uno por uno).
3. **Rutas**: las ~58 rutas de `routes-config.tsx` se convierten a archivos en `src/routes/`; los guards (`AuthGuard`, `RoleGuard`, `AdminRouteGuard`) se preservan como layouts anidados. Verificación mecánica de que ningún guard se pierda.
4. **Entradas obsoletas**: se eliminan `index.html`, `src/main.tsx`, `src/App.tsx` (con respaldo previo); sus personalizaciones (título, meta tags, fuentes) se portan al nuevo `__root.tsx`.
5. **Edge functions**: las 24 funciones de Supabase se migran al formato de server functions.
6. **Verificación triple**: build verde + typecheck + verificación de rutas servidas. Si algo falla y no se puede resolver, se reporta el estado exacto para revertir desde el historial.

## Qué NO cambia

- Base de datos, RLS, triggers, RPCs, máquinas de estado, lógica fiscal: intactos (la migración es solo de framework frontend).
- Componentes shadcn de `src/components/ui/`.
- Dependencias de negocio (xlsx, date-fns, etc.).

## Riesgos conocidos y mitigación


| Riesgo                            | Mitigación                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Ola de errores TS por strict mode | Se absorben en el paso de verificación; el plan de edge-cases tiene recetas por patrón |
| Guards anidados (~58 rutas)       | Inventario + verificación mecánica de que ninguno se pierda                            |
| Suite Vitest sin config           | El script `test` se conserva pero necesitará re-cableado posterior (follow-up)         |
| Workflows de CI apuntan a Vite    | Se listan al final como follow-ups; no bloquean la migración                           |


## Después de la migración (follow-ups opcionales)

- Re-cablear `vitest` al nuevo setup de TanStack
- Ajustar workflows de CI (changelog-check, lighthouse)
- Revisar workflows de publicación

## Detalles técnicos

- La migración sigue el proceso oficial de Lovable (preflight → scaffolding → merge de package.json → generación de rutas → verificación).
- `src/integrations/supabase/client.ts` se parchea (referencia a `localStorage` con guard SSR).
- 7 archivos usan `useSearchParams`: siguen funcionando con un shim de compatibilidad; migración idiomática es opcional.
- Sin PWA/service worker detectado: se omite ese paso completo.

No hacemos nada por ahora