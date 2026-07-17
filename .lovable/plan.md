# Auditoría de Pull Requests — `hlopezb83/liftgo`

**Panorama:** 10 PRs abiertos, todos de `dependabot[bot]`. 6 son bumps de npm (5 con CI en rojo) y 4 son bumps de GitHub Actions (3 verdes). Ningún PR viene de humanos, así que la revisión es puramente de riesgo de dependencia + estado de CI.

## Resumen por PR

| # | Paquete | Salto | CI | Riesgo | Recomendación |
|---|---|---|---|---|---|
| 20 | `typescript` 5.9.3 → **7.0.2** | major x2 | 🔴 8 checks | 🔴 Alto | **Cerrar** |
| 19 | `react-dropzone` 16 → **17** | major | 🔴 8 checks | 🟡 Medio | **Cerrar por ahora** |
| 18 | `@types/node` 24 → **26** | major x2 | 🔴 8 checks | 🟡 Medio | **Cerrar** |
| 17 | `jsdom` 26 → **29** | major x3 | 🔴 8 checks | 🟡 Medio | **Cerrar** |
| 16 | `postcss` 8.5.17 → 8.5.19 | patch | 🔴 8 checks | 🟢 Bajo | **Investigar y mergear** |
| 14 | GH Actions minor-patch group (3) | minor/patch | 🟢 | 🟢 Bajo | **Mergear** |
| 12 | `actions/labeler` 5 → **6** | major | 🟢 | 🟢 Bajo | **Mergear** (validar pin de SHA en `.github/workflows/labeler.yml`) |
| 11 | `gitleaks/gitleaks-action` 2.3.9 → **3.0.0** | major | 🔴 `Secrets check` | 🟡 Medio | **Investigar** el fallo antes de mergear |
| 4 | `github/codeql-action` 3 → **4** | major | 🔴 5 checks (E2E/Deno/CodeQL) | 🟡 Medio | **Rebasear** y re-evaluar; los fallos parecen ambientales (junio) |
| 2 | `actions/cache` 4 → **6** | major x2 | 🟢 | 🟢 Bajo | **Mergear** |

## Detalle y justificación

### 🔴 Cerrar (breaking changes reales)

- **#20 TypeScript 7.0.2** — TS 7 aún no existe estable a la fecha del repo; es un salto ficticio o pre-release. El proyecto está atado a `^5.9.3` y todo el `tsconfig` (strict, `verbatimModuleSyntax`, plugins de Vite) está calibrado para 5.x. Además rompe `tsgo` y el typecheck del CI. **Cerrar.**
- **#19 react-dropzone 17** — Acabamos de migrar a v16 en el sprint E (v7.56.0 / v7.57.0). Un major inmediato invalida esa auditoría reciente sin ganancia. **Cerrar** y reabrir cuando haya changelog público que amerite.
- **#18 @types/node 26** — Nuestro runtime objetivo es Node 20/22 (`.nvmrc`). Tipos de Node 26 introducen APIs no disponibles y rompen typecheck. **Cerrar** hasta que `.nvmrc` suba.
- **#17 jsdom 29** — Vitest 2.x sólo soporta jsdom hasta 26/27. Saltar 3 majors rompe los tests de `useDocuments.rls`, `formDialog`, etc. **Cerrar** hasta que subamos Vitest.

### 🟡 Investigar

- **#16 postcss 8.5.19** — Es sólo un patch, no debería romper nada. El hecho de que 8 checks estén rojos apunta a que la rama está desactualizada contra `main` (Dependabot lleva 4 días sin rebase). Acción: `dependabot rebase` y si sigue rojo, leer el log de `Build (Vite)`.
- **#11 gitleaks-action 3.0.0** — El único check en rojo es `Secrets check`, que es precisamente el que corre gitleaks. La v3 cambió los inputs (`GITLEAKS_LICENSE`, `GITLEAKS_ENABLE_UPLOAD_ARTIFACT`). Hay que actualizar `.github/workflows/gitleaks.yml` en el mismo PR antes de mergear.
- **#4 codeql-action v4** — Los fallos son E2E/Deno/CodeQL de mediados de junio (branch vieja). Rebasear con `@dependabot rebase`; los E2E de main ya fueron endurecidos (v7.72.6–v7.72.11) y deberían pasar.

### 🟢 Mergear directo

- **#14** — grupo minor/patch de actions, ya en verde.
- **#12 actions/labeler v6** — verde. Confirmar sólo que el workflow siga pineado por SHA (nuestro `labeler.yml` usa `@8558fd74…` que corresponde a v5; Dependabot debió actualizar el SHA también).
- **#2 actions/cache v6** — verde.

## Orden de acción sugerido

```text
1. Mergear #2, #12, #14                (bajo riesgo, verde)
2. Investigar y arreglar #11 y #16     (rebase + ajustar inputs)
3. Rebasear #4 y re-evaluar CI         (si verde, mergear)
4. Cerrar #17, #18, #19, #20 con nota  ("bloqueado por <razón>")
```

## Notas técnicas

- Los checks "unknown/None" en `mergeable_state` son porque GitHub no ha calculado merge status en PRs de Dependabot dormidos; se resuelven con un rebase.
- El repo tiene 16–19 checks configurados; el patrón "6 success + 8 failure + 2 skipped" en los npm bumps sugiere que el fallo raíz está en el bootstrap (probable `bun install` o typecheck) y el resto son fallos en cascada, no 8 problemas distintos.
- No hay PRs con conflicto de código de la app; todos tocan sólo `package.json` / `.github/workflows/*.yml`.

## Entregable

Este plan es **read-only**: sólo lista recomendaciones. Cuando lo apruebes, en build mode puedo:
- Comentar cada PR en GitHub (requiere linkear el conector de GitHub, hoy no está linkeado).
- O ejecutar localmente los merges/close vía `gh` si me das un token — pero lo natural es que tú (o quien tenga permisos de merge) aplique las acciones desde GitHub siguiendo esta tabla.
