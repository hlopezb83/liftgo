## Pin proyecto a Node 24

El proyecto corre con **Bun** en CI (no Node), pero los entornos locales y herramientas que respetan `engines` necesitan saber qué versión esperar. Cambios mínimos:

### 1. `package.json`
Añadir bloque `engines`:
```json
"engines": {
  "node": ">=24.0.0"
}
```

### 2. `.nvmrc` (nuevo)
Contenido: `24`
Para que `nvm use` / Volta / Fnm seleccionen Node 24 automáticamente.

### 3. `.node-version` (nuevo)
Contenido: `24`
Para herramientas que leen este archivo (asdf, nodenv).

### Lo que NO cambia
- **CI (`.github/workflows/ci.yml`):** todos los jobs corren con Bun (`oven-sh/setup-bun@v2`), no con `actions/setup-node`. Ya existe `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` que fuerza las JS actions de GitHub a Node 24. No hay nada que actualizar.
- **Edge Functions:** corren en Deno, no Node. Sin cambios.
- **Dependencias:** todas las que usamos (Vite 5, React 18, TypeScript 5, Vitest, Playwright) son compatibles con Node 24.

### Changelog
Entrada `v6.42.1` (patch — tooling/infra): "Proyecto fijado a Node 24".