## Objetivo

Crear `.github/pull_request_template.md` con una checklist accionable derivada de **§20 "Dependencias antes que código propio"** de `architecture.md`, para que cada PR justifique altas/bajas de dependencias y no introduzca código hand-rolled que duplique el stack canónico.

> Nota: §21 es "Referencias" (sin checklist). La auditoría se basa íntegramente en §20.1-§20.7.

## Archivo nuevo: `.github/pull_request_template.md`

Estructura propuesta:

1. **Resumen** — 1-3 líneas de qué y por qué.

2. **Tipo de cambio** — checkboxes: `feature` / `refactor` / `fix` / `docs` / `chore`.

3. **Checklist §20 — Dependencias antes que código propio**
   - [ ] No reimplementé funcionalidad ya cubierta por el stack canónico (§20.4).
   - [ ] Si añadí una dependencia, cumple §20.2 (mantenida <12m, tipos TS, licencia permisiva, sin vulnerabilidades altas).
   - [ ] Si escribí código propio en lugar de usar una librería, encaja en §20.3 (regla de negocio LiftGo, RPC de seguridad, o glue <30 LOC documentado).
   - [ ] Si retiré código hand-rolled, eliminé el archivo legacy en el mismo PR (no lo dejé muerto).
   - [ ] Si la dependencia pasa a ser canónica, actualicé §2 y §20.4 de `architecture.md`.

4. **Checklist general (Power of 10 §18)**
   - [ ] Componentes ≤150 LOC, hooks ≤80 LOC.
   - [ ] Sin `any` / `!` / `as`; errores con `unknown` + Zod cuando aplica.
   - [ ] Paginación obligatoria en listas (>1000 filas potenciales).
   - [ ] `useEffect` con cleanup donde corresponde.
   - [ ] Cero warnings de TS / ESLint.

5. **Checklist de cierre**
   - [ ] Entrada nueva en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`.
   - [ ] Tests (`bunx vitest run`) o verificación manual descrita.
   - [ ] Si hay cambios de esquema, migración SQL con `SET search_path = public` y RLS revisada.

6. **Notas para reviewer** — sección libre.

## Changelog

Entrada `6.6.0-alpha.4` tipo `docs`/`chore`:
- `public/changelog.json` (índice).
- `public/changelog/v6.6.0-alpha.4.json` (detalle: nuevo PR template con checklist §20).

## Fuera de alcance

- No se añade Action/CI que valide la checklist (puede ser follow-up con un workflow que verifique presencia de entrada en changelog y secciones marcadas).
- No se modifican `architecture.md` ni código fuente.

## Riesgo

Nulo — solo documentación. El template aplica a PRs futuros; los existentes no se ven afectados.
