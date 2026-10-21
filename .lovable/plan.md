# Compatibilidad del instalador Lovable con la corrección 8.44.18

## Hechos observados (lectura, 2026-10-21 00:05 UTC)
- HEAD del sandbox: `24082043fed41286777f4594aa04102ec99e942c` (coincide con main declarado).
- Instalador del sandbox: `/bin/bun`, `bun --version` = **1.3.3** (no 1.4.2).
- `bun.lock` en este HEAD: `"lockfileVersion": 1`, `"configVersion": 1` (no 3).
- `package.json` overrides en este HEAD: sólo `zod-validation-error`, `rolldown 1.2.11`, `vite 8.3.3`. No contiene los overrides por padre de esbuild ni postcss-selector-parser.
- Lock actual resuelve `@esbuild-kit/core-utils/esbuild` = 0.18.20 y `@tailwindcss/typography` → `postcss-selector-parser 6.0.10`.
- Resolución de paquetes en el sandbox pasa por un caché npm interno de Lovable (URLs `sandbox-npm-cache` en el lock).
- El log del servidor de vista previa no registra la versión ni el comando de instalación.

## Lo que NO puedo acreditar
- La versión de Bun y el comando exacto del build de hosting/publicación: no hay logs ni metadatos expuestos; no asumo que sea igual al sandbox ni al pin de CI.
- Que Bun 1.3.3 lea `lockfileVersion 3`: no probado. Probable riesgo: una versión anterior podría rechazar el lock o reescribirlo/re-resolver, perdiendo los overrides.
- Que los overrides anidados `padre → hijo` se respeten en Lovable: la corrección no está en este HEAD, así que no hay evidencia.

## Conclusión
Con la evidencia disponible, la respuesta es **no confirmado, con indicio de incompatibilidad**: el instalador observado es 1.3.3 y el lock vigente es v1.

## Verificación propuesta (sólo si la autorizas; sin publicar ni desplegar)
1. En una rama/borrador aislado con el commit de la corrección, ejecutar en /tmp una copia: `bun install --frozen-lockfile` con 1.3.3 y registrar salida/errores.
2. Comprobar en `node_modules` las versiones efectivas de `@esbuild-kit/core-utils/node_modules/esbuild` y `postcss-selector-parser` bajo typography.
3. Verificar si el sandbox reescribe `bun.lock` al sincronizar.
4. Para hosting: pedir confirmación al equipo Lovable (vía feedback) de la versión de Bun del build de publicación; no inferirla.
