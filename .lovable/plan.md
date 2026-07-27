## Estado actual

Nuestra app **ya corre en Node 24** en todos los puntos donde nosotros controlamos la versión:

- `package.json` → `"engines": { "node": ">=24.0.0" }` ✅
- `.github/actions/setup-bun-project/action.yml` → default `node-version: "24"` con `actions/setup-node@v5` (runtime Node 24) ✅
- Los **10 jobs** de CI que instalan Node vía `setup-bun-project` (`ci.yml`, `bundle-size.yml`, `changelog-check.yml`, `supabase-lint.yml`) heredan Node 24 ✅
- Edge Functions corren en Deno v2.x — no dependen de Node ✅

La advertencia `Node 20 deprecated` que vimos en el log de `gitleaks` **no viene de nuestro código** sino del *runtime interno* de acciones de terceros que aún declaran `runs.using: "node20"` en su `action.yml`. Nuestras workflows no pueden forzar su runtime — hay que actualizar cada acción a la versión que ya migró a `node24`.

Analogía: nuestro coche (la app) ya usa gasolina Premium (Node 24). Pero contratamos servicios externos (acciones de terceros) y algunos siguen llegando en un camión viejo (Node 20). Sólo podemos cambiarlos por su versión nueva cuando esté disponible.

## Acciones de terceros a auditar/actualizar

Hay que verificar en el marketplace de cada una si ya publicaron una versión sobre Node 24 y, si existe, subir el pin (mantener SHA + comentario de versión). Candidatas detectadas:

| Acción actual | Archivo | Estado esperado |
|---|---|---|
| `gitleaks/gitleaks-action@v2.3.9` | `gitleaks.yml` | Node 20 — revisar si hay v2.4+/v3 en Node 24 |
| `actions/labeler@v5.0.0` | `labeler.yml` | Node 20 — revisar v6 |
| `actions/stale@v9.1.0` | `stale.yml` | Node 20 — revisar v10 |
| `amannn/action-semantic-pull-request@v5.5.3` | `pr-title.yml` | Node 20 — revisar v6 |
| `release-drafter/release-drafter@v7.3.1` | `release-drafter.yml` | Node 20 — revisar v8 |
| `treosh/lighthouse-ci-action@v12.6.2` | `lighthouse.yml` | Node 20 — revisar v13 |
| `github/codeql-action@v3` (init/analyze) | `codeql.yml` | Node 20 — revisar v4 |
| `actions/github-script@v7.0.1` | `lighthouse.yml`, `prod-smoke.yml` | Node 20 — revisar v8 |
| `actions/dependency-review-action@v4.7.1` | `ci.yml` | Node 20 — revisar v5 |
| `supabase/setup-cli@v2.1.1` | `supabase-lint.yml` | Node 20 — revisar v3 |
| `denoland/setup-deno@v2.0.4` | `ci.yml` | Node 20 — revisar update |
| `oven-sh/setup-bun@v2.2.0` | `setup-bun-project` | verificar runtime |

## Plan de ejecución

### Fase 1 — Verificación (read-only, sin cambios)
Para cada acción de la tabla, consultar el `action.yml` publicado en la última release estable (marketplace / GitHub) y anotar:
- Su `runs.using` actual (`node20` vs `node24`).
- Si existe major posterior sobre Node 24 disponible hoy.

Salida: mini-reporte en el chat con dos listas — **actualizables ya** y **aún sin versión Node 24**.

### Fase 2 — Actualización (sólo las que tengan versión estable Node 24)
Por cada acción actualizable:
- Editar el `.github/workflows/*.yml` correspondiente.
- Mantener el patrón "pin a SHA + comentario `# vX.Y.Z`" que ya usamos.
- Verificar breaking changes en release notes (parámetros renombrados, defaults distintos). Si hay breaking, ajustar el step.

### Fase 3 — Documentación
- Nueva entrada en `public/changelog.json` + `public/changelog/v7.236.3.json` (patch) listando qué acciones se movieron a Node 24 y cuáles quedan pendientes (con nombre + razón: "sin release Node 24 al día de hoy").

## Verificación

- Los workflows actualizados siguen pasando localmente en syntax (`yamllint` implícito por GitHub) — no hay forma de correrlos aquí, se validan en el próximo PR.
- No debe haber cambios en `src/`, `supabase/`, ni en la app en runtime.
