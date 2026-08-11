# Saltar el job validate de changelog-check en PRs de Dependabot

## Cambio

Añadir `if: github.actor != 'dependabot[bot]'` al job `validate` de `.github/workflows/changelog-check.yml`, igual que ya tiene el job `version-sync`.

## Motivo

Dependabot nunca toca `public/changelog.json` ni los archivos de changelog/version; por diseño, el PR solo actualiza dependencias. El job `validate` corre `bun scripts/validate-changelog.ts` y falla en esos PRs (14/20 runs fallidos). Con el guard, los PRs de Dependabot omiten ambos checks y los PRs humanos siguen ejecutando `validate` y `version-sync` normalmente.

## Archivo a editar

- `.github/workflows/changelog-check.yml`: añadir `if: github.actor != 'dependabot[bot]'` en el job `validate` (línea 24-31).

## Verificación

- `bun run lint` o validación de YAML no aplica directamente; se validará en el próximo PR humano y en el próximo PR de Dependabot confirmando que `validate` ya no corre para el bot.
- Changelog: se actualizará con una entrada patch al aplicar el cambio.
