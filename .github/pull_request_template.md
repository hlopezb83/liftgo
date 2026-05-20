<!--
Plantilla de PR de LiftGo. Borra las secciones que no apliquen.
Doctrina de referencia: `architecture.md` §18 (Power of 10) y §20 (Dependencias antes que código propio).
-->

## Resumen

<!-- 1-3 líneas: qué cambia y por qué. -->

## Tipo de cambio

- [ ] feature
- [ ] refactor
- [ ] fix
- [ ] docs
- [ ] chore

## Checklist §20 — Dependencias antes que código propio

- [ ] No reimplementé funcionalidad ya cubierta por el stack canónico (§20.4).
- [ ] Si **añadí una dependencia**, cumple §20.2 (release < 12 meses, tipos TS, licencia permisiva, sin vulnerabilidades altas, tamaño razonable).
- [ ] Si **escribí código propio** en lugar de usar una librería, encaja en §20.3 (regla de negocio LiftGo, RPC de seguridad, o glue < 30 LOC documentado).
- [ ] Si **retiré código hand-rolled**, eliminé el archivo legacy en el mismo PR (no quedó código muerto ni imports rotos).
- [ ] Si la dependencia pasa a ser canónica, actualicé `architecture.md` §2 (Stack tecnológico) y §20.4 (tabla del stack canónico).

**Dependencias añadidas / removidas:**

<!-- Lista `bun add` / `bun remove` ejecutados, con justificación breve. Si no aplica, escribe "ninguna". -->

## Checklist §18 — Power of 10

- [ ] Componentes ≤ 150 LOC, hooks ≤ 80 LOC.
- [ ] Sin `any` / `!` / `as`; errores con `unknown` + Zod cuando aplica.
- [ ] Paginación obligatoria en listas (>1000 filas potenciales).
- [ ] `useEffect` con cleanup donde corresponde (suscripciones, listeners, timers).
- [ ] Cero warnings de TypeScript / ESLint.
- [ ] Sin prop drilling > 3 niveles.

## Checklist de cierre

- [ ] Entrada nueva en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json` (semver acorde a la magnitud).
- [ ] Tests (`bunx vitest run`) verdes, o verificación manual descrita abajo.
- [ ] Si hay cambios de esquema: migración SQL con `SET search_path = public`, RLS revisada y `has_role` aplicado donde corresponde.
- [ ] Mobile probado con `MobileCardList` si toca listas.

## Verificación

<!-- Pasos manuales realizados o tests que cubren el cambio. -->

## Notas para reviewer

<!-- Contexto adicional, riesgos, follow-ups. -->
