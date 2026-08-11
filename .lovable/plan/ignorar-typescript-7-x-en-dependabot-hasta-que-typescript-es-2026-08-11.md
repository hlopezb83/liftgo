# Ignorar TypeScript 7.x en Dependabot hasta que typescript-eslint lo soporte

## Cambio

Añadir una sección `ignore` en el ecosistema `bun` de `.github/dependabot.yml` para bloquear actualizaciones de `typescript` a versiones `>= 7`.

```yaml
    ignore:
      - dependency-name: "typescript"
        versions: [">= 7"]
```

## Motivo

El PR "Bump typescript to 7.0.2" rompe el job ESLint porque `typescript-eslint` aún no soporta TypeScript 7.x. Al ignorar específicamente la major 7, Dependabot sigue proponiendo parches y menores de TypeScript 6.x, pero no generará el PR problemático. Cuando `typescript-eslint` anuncie soporte para TS 7, se elimina este ignore.

## Archivo a editar

- `.github/dependabot.yml`: añadir la sección `ignore` dentro del bloque `package-ecosystem: "bun"` (líneas 15-41).

## Cierre del PR existente

Tras mergear este cambio, cerrar manualmente el PR abierto por Dependabot para `typescript-7.0.2`.

## Verificación

- Validar sintaxis YAML con `bun` o cualquier linter YAML disponible.
- El próximo ciclo de Dependabot no debería regenerar el PR de TypeScript 7.x.
- Changelog: se actualizará con una entrada patch al aplicar el cambio.
