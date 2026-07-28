## Diagnóstico

El workflow "Actualizar draft de release" falla al validar `.github/release-drafter.yml`. En la migración anterior (v7.247.2) escribí las etiquetas como:

```yaml
when:
  labels:
    any:
      - "feature"
```

pero el esquema de release-drafter v7.6.0 espera que `when.labels` sea **una lista directa** (el modo `any` ya es el default y se controla aparte con `labels-mode`), o bien que `when` sea una lista de condiciones. De ahí los 10 errores `invalid_union` — uno por cada categoría.

## Cambio propuesto

Reescribir las 10 categorías de `.github/release-drafter.yml` quitando el nivel `any:`:

```yaml
categories:
  - type: pre-exclude
    when:
      labels: ["skip-changelog"]

  - title: "Nuevas funcionalidades"
    semver-increment: minor
    when:
      labels: ["feature", "enhancement"]
  ...
```

Detalles:
- Se conservan exactamente las mismas etiquetas, títulos, `semver-increment` y las categorías `version-resolver` (major/minor/patch).
- Se elimina también `type: changelog` (no es un tipo válido del esquema; las categorías con `title` ya salen en las notas).
- Se mantiene `version-resolver.default: patch`, `autolabeler`, `template` y `change-template` sin cambios.

## Validación
- Parsear el YAML localmente y comprobar la forma de cada `when` (labels debe ser array).
- Confirmar que no queda ningún `any:` bajo `labels`.
- Agregar entrada de changelog patch (v7.247.4) en `public/changelog.json` + `public/changelog/v7.247.4.json`.

La confirmación real llega al hacer merge a main, cuando el workflow vuelva a correr sin anotaciones.
