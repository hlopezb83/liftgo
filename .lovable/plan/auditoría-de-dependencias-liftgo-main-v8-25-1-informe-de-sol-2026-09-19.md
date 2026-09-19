# Auditoría de dependencias LiftGo (main, v8.25.1) — informe de solo lectura

Sin cambios a archivos, lockfile ni producción. Fuentes: `package.json`, `bun.lock` (lockfileVersion 1), registro npm en vivo, escáner de vulnerabilidades del proyecto.

## Resumen

- **0 vulnerabilidades conocidas** en las 75 dependencias de producción (escáner vs bun.lock).
- **Engines**: todos los paquetes clave aceptan Node 24 (`engines: node >=24`); vitest 5 exige `^22.12 || ^24 || >=26`, vite 8 exige `^20.19 || >=22.12`. Sin conflicto con `.node-version` = 24.
- Cadena de build íntegra y compatible: `vite 8.2.2` + `@vitejs/plugin-react 5.2.0` (peer `^8.0.0` ✔) + `@lovable.dev/vite-tanstack-config 2.21.0` (peer vite `<9` ✔, nitro `>=3.0.260603-beta` ✔) + `nitro 3.0.260603-beta` (fijado) + React 19.2.8 + TypeScript 6.0.3.

## 1) Actualizaciones patch/minor de bajo riesgo (dentro de rango o patch de pin)

| Paquete | Declarada | Instalada | Candidata | Tipo | Recomendación |
|---|---|---|---|---|---|
| @tanstack/react-router | 1.170.33 (pin) | 1.170.33 | 1.170.38 | patch | Actualizar junto con react-start |
| @tanstack/react-start | 1.168.50 (pin) | 1.168.50 | 1.168.56 | patch | Actualizar en el mismo commit que router |
| @tanstack/react-virtual | ^3.14.11 | 3.14.11 | 3.14.13 | patch | `bun update` |
| @tanstack/react-query (+persist, sync, devtools) | ^5.101.x | 5.102.8 | 5.103.1 | minor | `bun update` (4 paquetes juntos) |
| react / react-dom | ^19.2.0 | 19.2.8 | 19.3.0 | minor | Probar E2E smoke tras actualizar |
| @types/react / @types/react-dom | ^19.2.0 | 19.2.18/19.2.7 | 19.3.0 | minor | Acompañar a react |
| react-hook-form | ^7.71.2 | 7.87.0 | 7.88.0 | minor | `bun update` |
| lucide-react | ^1.31.0 | 1.41.0 | 1.47.0 | minor | Verificar iconos usados (renombres ocasionales) |
| zod | ^4.4.3 | 4.5.4 | 4.6.5 | minor | `bun update`; revisar coerce/schemas |
| @sentry/react | ^10.70.0 | 10.73.0 | 10.75.0 | minor | Alinear con @sentry/vite-plugin |
| tailwind-merge | ^3.5.0 | 3.6.0 | 3.7.0 | minor | `bun update` |
| marked | ^18.0.12 | 18.0.12 | 18.0.13 | patch | `bun update` |
| react-dropzone | 20.1.1 (pin) | 20.1.1 | 20.1.2 | patch | Subir pin |
| @babel/core | ^8.0.1 | 8.0.1 | 8.0.6 | patch | `bun update` |
| @rolldown/plugin-babel | ^0.2.3 | 0.2.3 | 0.2.4 | patch | `bun update` |
| @testing-library/dom | ^10.4.1 | 10.4.1 | 10.4.2 | patch | `bun update` |
| happy-dom | ^20.11.2 | 20.14.0 | 20.14.5 | patch | `bun update` |
| prettier | ^3.7.3 | 3.9.6 | 3.9.8 | patch | `bun update` + `bun run format` |
| eslint-plugin-playwright | ^2.11.0 | 2.11.0 | 2.12.0 | minor | `bun update` |
| eslint-plugin-react-refresh | ^0.4.20 | 0.4.26 | 0.5.7 | minor | `bun update` |
| knip | ^6.32.2 | 6.34.0 | 6.37.0 | minor | `bun update` |
| @lovable.dev/vite-tanstack-config | ^2.20.0 | 2.21.0 | 2.23.1 | minor | Actualizar; validar build dev+prod |
| nitro | 3.0.260603-beta (pin) | igual | 3.0.260903-beta | prerelease patch | Opcional; probar `wrangler dev` y E2E |

## 2) Lockfile por delante del rango declarado (rango "atrasado", sin acción urgente)

El lockfile ya resolvió versiones mayores que el mínimo del rango `^` — es normal y sano; sólo conviene refrescar el número declarado al próximo bump:

- Radix UI (26 paquetes): p. ej. react-avatar ^1.1.11 → 1.2.6; react-radio-group ^1.3.8 → 1.4.7; react-select ^2.2.6 → 2.3.7.
- @hookform/resolvers ^5.2.2 → 5.9.1; @react-pdf/renderer ^4.6.1 → 4.9.0; @tailwindcss/vite y tailwindcss ^4.2.1 → 4.3.3; date-fns ^4.1.0 → 4.4.0; input-otp ^1.4.2 → 1.5.0; papaparse ^5.6.0 → 5.7.0; sonner ^2.0.7 → 2.0.8; tw-animate-css ^1.3.4 → 1.4.0; vite-tsconfig-paths ^6.0.2 → 6.1.1; @playwright/test ^1.62.1 → 1.63.0; @testing-library/react ^16.3.2 → 16.3.3; react-resizable-panels ^4.6.5 → 4.12.4.
- Recomendación: ninguna acción; `bun update` periódico ya las mantiene.

## 3) Saltos major / riesgo — NO aplicar sin lote dedicado

| Paquete | Instalada | Candidata | Riesgo |
|---|---|---|---|
| typescript | 6.0.3 (pin) | 7.0.2 | Dependabot ya ignora >=7 hasta que typescript-eslint lo soporte. Mantener pin. |
| vitest + @vitest/coverage-v8 | 4.1.11 (pin) | 5.0.1 | Major; exige actualizar ambos a la vez y revisar config happy-dom. Lote aparte con suite completa. |
| @vitejs/plugin-react | 5.2.0 | 6.1.1 | Major; cambia peer a `vite ^8` + oxc-transform-react. Coordinar con @lovable.dev/vite-tanstack-config (hoy peer `>=4`). Esperar a que la config de Lovable lo declare compatible. |
| eslint + @eslint/js | 9.39.5 | 10.x/10.0.1 | Major ESLint 10; rompe plugins hasta que typescript-eslint y plugins lo soporten. |
| @types/node | 24.13.3 | 26.6.2 | Major de tipos; el runtime sigue siendo Node 24. Mantener en 24.x. |
| @tanstack/react-table | 8.21.3 (pin) | 9.2.4 | Major con API revista; revisar todas las tablas. Lote aparte. |
| globals | 15.15.0 | 17.12.0 | Major; actualizar junto con ESLint. |
| jsdom | 30.0.1 (pin) | 30.1.0 | minor, pero jsdom no es el entorno activo (happy-dom sí); bajo valor. |

## 4) Vulnerabilidades e incompatibilidades

- Vulnerabilidades: ninguna reportada por el escáner sobre producción.
- overrides vigentes (`zod-validation-error ^4.0.2`, `rolldown 1.2.7`): conservar; verificar periódicamente si el pin de rolldown sigue siendo necesario.
- nitro es beta fijado a propósito por el preset cloudflare-module; sólo mover junto con @lovable.dev/vite-tanstack-config.
- bunfig.toml aplica guardia supply-chain de 24 h; respetarla en cualquier actualización.

## Comandos propuestos tras aprobación (lote 1: bajo riesgo)

```bash
bun update @tanstack/react-query @tanstack/react-query-persist-client \
  @tanstack/query-sync-storage-persister @tanstack/react-query-devtools \
  react react-dom @types/react @types/react-dom react-hook-form zod \
  @sentry/react tailwind-merge marked @babel/core @rolldown/plugin-babel \
  @testing-library/dom happy-dom prettier eslint-plugin-playwright \
  eslint-plugin-react-refresh knip @tanstack/react-virtual @lovable.dev/vite-tanstack-config
bun add @tanstack/react-router@1.170.38 @tanstack/react-start@1.168.56 react-dropzone@20.1.2
bun run lint && bunx tsgo --noEmit && bun run build && bunx vitest run
bun run changelog:check   # y entrada de changelog + gen-version según flujo del repo
```

Lotes posteriores (separados y con plan propio): vitest 5 + coverage, ESLint 10, @tanstack/react-table 9, @vitejs/plugin-react 6 (cuando la config de Lovable lo soporte), TypeScript 7 (cuando typescript-eslint lo soporte).

## Notas

- Dependabot (mensual, agrupado, ecosistema bun) ya cubre la mayoría del lote 1; estos comandos sirven si se quiere adelantar el ciclo.
- No se verificó un run de GitHub Actions posterior a esta auditoría; cualquier actualización debe confirmarse en CI.
