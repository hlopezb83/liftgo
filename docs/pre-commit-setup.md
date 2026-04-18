# Pre-commit hooks (Husky + lint-staged)

Este proyecto usa **Husky** y **lint-staged** para validar código antes de cada commit.

## Activación local

Tras clonar el repo, ejecuta una vez:

```bash
npm install
npx husky init   # si la carpeta .husky aún no está activa
npm pkg set scripts.prepare="husky"
npm run prepare
```

> Nota: en el entorno de Lovable los hooks de git no se ejecutan (el estado de git
> está gestionado internamente). Esta configuración aplica únicamente cuando trabajas
> en tu máquina local.

## Qué corre el hook

En cada `git commit`:

1. **lint-staged** ejecuta `eslint --fix --max-warnings=0` sobre los archivos
   `.ts`/`.tsx` en staging. Si hay warnings o errores, el commit se aborta.
2. **`tsc --noEmit`** verifica los tipos de todo el proyecto (TypeScript no
   soporta type-check confiable archivo-por-archivo).

## Saltar el hook (no recomendado)

```bash
git commit --no-verify -m "wip"
```

## Archivos relacionados

- `.husky/pre-commit` — script que se ejecuta
- `.lintstagedrc.json` — patrones y comandos por extensión
- `eslint.config.js` — reglas (incluye `max-lines`, `max-lines-per-function`, `complexity`)
