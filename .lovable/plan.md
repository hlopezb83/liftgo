## Problema

Dependabot está inyectando automáticamente credenciales de `npm.pkg.github.com` (GitHub Packages) vía el experimento `automatic-github-packages-auth` a nivel organización/enterprise. Como el repo **no usa GitHub Packages** (no hay `.npmrc`, ni scopes `@owner/*`), el updater aborta con:

```
private_registry_config_not_found — Private npm registries require either a
.npmrc file in your repository, or explicit `scope`/`replaces-base`
configuration in dependabot.yml. Registry: npm.pkg.github.com
```

Esto bloquea todos los PRs de Dependabot npm (React types, recharts, globals, react-day-picker, grupos dev-minor-patch y prod-patch).

## Solución

Crear un `.npmrc` mínimo en la raíz del repo que fije explícitamente el registry público. Eso satisface el check de Dependabot ("hay .npmrc") sin cambiar el comportamiento de `bun install` (bun ya usa `registry.npmjs.org` por defecto y respeta `.npmrc`).

### Archivo a crear

**`.npmrc`**
```
registry=https://registry.npmjs.org/
```

Notas técnicas:
- No agregamos ningún token — el registry es público.
- No agregamos scopes `@owner:registry=...` porque no consumimos paquetes de GitHub Packages.
- Bun 1.2.x lee `.npmrc` para resolver el registry; no rompe el lockfile ni la CI (`bun install --frozen-lockfile` sigue igual).
- No tocamos `dependabot.yml`: el problema no es la config del repo sino la auto-inyección a nivel org. El `.npmrc` es la vía recomendada por el propio mensaje de error.

### Verificación posterior (post-merge)

1. Esperar el próximo run de Dependabot (lunes 06:00 America/Monterrey) o dispararlo manualmente desde Insights → Dependency graph → Dependabot → "Check for updates".
2. Confirmar que los PRs #6–#10 se refrescan sin el error `private_registry_config_not_found`.

### Changelog

Agregar entrada patch **v6.103.1** en `public/changelog.json` + `public/changelog/v6.103.1.json`:
- title: "Fix Dependabot: registry público explícito en `.npmrc`"
- description breve del problema y la solución.

## Archivos

- **Crear** `.npmrc` (1 línea)
- **Crear** `public/changelog/v6.103.1.json`
- **Editar** `public/changelog.json` (nueva entrada al inicio)
