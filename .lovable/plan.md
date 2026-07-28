## Objetivo

Eliminar los 10 warnings de "Actualizar draft de release" migrando `.github/release-drafter.yml` al esquema nuevo de release-drafter (PR #1558). Es solo configuración de CI: no cambia la app ni el changelog interno.

## Qué está pasando

Release Drafter cambió su formato: las etiquetas ya no se declaran sueltas en cada bloque, sino dentro de una condición `when`. Los tres bloques deprecados que usamos son:
- `categories[*].labels` (las 7 categorías) → mover a `when.labels.any`
- `version-resolver.major.labels` / `.minor.labels` → declarar el incremento en la categoría
- `exclude-labels` → categoría de tipo `pre-exclude`

## Cambios en `.github/release-drafter.yml`

1. **Exclusión**: reemplazar `exclude-labels: [skip-changelog]` por una categoría al inicio:
   ```yaml
   categories:
     - type: pre-exclude
       when:
         labels:
           any: ["skip-changelog"]
   ```
2. **Categorías de changelog**: cada una pasa a `type: changelog` con su `when.labels.any`, conservando exactamente los mismos títulos y etiquetas (Nuevas funcionalidades, Fixes, Seguridad, Performance, Infraestructura / CI, Base de datos, Documentación).
3. **Resolución de versión**:
   - `semver-increment: minor` en "Nuevas funcionalidades" (cubre `feature` / `enhancement`).
   - Categorías extra de `type: version-resolver` (sin título, no salen en las notas) para las etiquetas que hoy solo viven en `version-resolver`: `major` + `breaking` → major; `minor` → minor; `patch`, `chore` → patch.
   - Se conserva `version-resolver.default: patch` (ese campo no está deprecado).
4. Se conservan sin cambios: `name-template`, `tag-template`, `autolabeler`, `change-template`, `change-title-escapes` y `template`.

El resultado debe producir exactamente las mismas notas y el mismo cálculo de versión que hoy, solo que sin warnings.

## Verificación

- `actionlint` sobre los workflows (job que ya corre en CI).
- Validar que el YAML parsea y que las 7 categorías + exclusión + incrementos quedan completos comparando contra el archivo actual.
- Los warnings desaparecen en el próximo run de "Actualizar draft de release" al hacer merge a `main`.

## Changelog

Entrada patch (v7.247.2) en `public/changelog.json` + `public/changelog/v7.247.2.json` describiendo la migración de la configuración de notas de release.
