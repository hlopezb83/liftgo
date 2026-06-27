# Plan: actualización segura de dependencias

## Resultado de `bun outdated`

De los 25 paquetes desactualizados, **solo 1** tiene una nueva versión minor/patch dentro de la columna "Update" (semver-safe). El resto son saltos **major** que requieren refactor o están explícitamente vetados.

## Acción propuesta (segura)

Actualizar un único paquete dev:

```text
knip  6.21.0  →  6.22.0   (patch, dev-only)
```

Pasos:
1. `bun update knip` (respeta el caret y no toca otros paquetes).
2. `bun run build` + `bunx knip` para verificar que la herramienta sigue corriendo limpia.
3. Entrada de changelog **v6.97.12** (patch, fix): "Actualización de knip 6.21.0 → 6.22.0".

## Paquetes major — NO incluidos (requieren proyecto aparte)

Estos saltos son breaking y los dejo fuera de este plan. Si quieres alguno, lo abordamos en un plan dedicado:

- **React 18 → 19** + `react-dom`, `@types/react*`: cambios de tipos, `forwardRef` deprecado, posibles incompatibilidades con Radix/Recharts.
- **react-router-dom 6 → 7**: nueva API de data routers y loaders.
- **Vite 5 → 8** + `@vitejs/plugin-react-swc 3 → 4`: revisar config, plugins, Node mínimo.
- **Tailwind 3 → 4**: nuevo engine (Oxide), config en CSS, breaking en plugins/tokens.
- **Zod 3 → 4**: cambios en `z.string()`, `errorMap`, `safeParse`.
- **date-fns 3 → 4**: timezone API rediseñada (impacta `nowMty` y formateadores).
- **react-day-picker 8 → 10**: nueva API de props.
- **sonner 1 → 2**: cambios de API de toasts (impacta wrapper global).
- **lucide-react 0.462 → 1.x**: rename masivo de íconos.
- **@hookform/resolvers 3 → 5**: requiere Zod 4.
- **tailwind-merge 2 → 3**: requiere Tailwind 4.
- **ESLint 9 → 10**, **typescript 5 → 6**, **jsdom 20 → 29**, **@types/node 22 → 26**, **globals 15 → 17**, **eslint-plugin-react-hooks 5 → 7**, **@vitest/coverage-v8 4.0 → 4.1** (minor pero acoplado a vitest core), **@eslint/js 9 → 10**: dev-deps, postergables.

## Notas

- `jspdf` y `jspdf-autotable` siguen bloqueados por política del proyecto (ya documentado en `dependabot.yml`).
- No hay CVEs altos/críticos pendientes (`bun audit` limpio tras v6.97.6–v6.97.9).
