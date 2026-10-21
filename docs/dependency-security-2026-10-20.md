# Corrección acotada de dependencias: 2026-10-20

Base revisada: `24082043fed41286777f4594aa04102ec99e942c` (versión publicada 8.44.17).
Este lote sólo actualiza dependencias de herramientas y añade pruebas de compatibilidad;
no cambia reglas de negocio, roles, migraciones SQL ni Edge Functions.

## Selección de versiones

Se consultaron metadatos oficiales de npm y los avisos GHSA el 20 de octubre de 2026.
No se ejecutó una actualización global ni `audit fix --force`.

| Familia | Antes | Después | Criterio |
| --- | --- | --- | --- |
| brace-expansion | 5.0.9 / 1.1.18 | 5.0.12 / 1.1.21 | Actualización del lock dentro de los rangos de minimatch; conservar ambas ramas. |
| esbuild, copia de core-utils | 0.18.20 | 0.28.2 | Override plano compatible con Bun 1.3.3; conserva Wrangler/tsx y prueba también el consumidor de Drizzle. |
| launch-editor | 2.14.1 | 2.14.2 | Parche permitido por el padre devtools-bundler-core. |
| postcss-selector-parser | 6.0.10 | 7.1.6 | Override plano; typography es el único consumidor del árbol y tiene pruebas de API y equivalencia de salida. |
| seroval, copia de solid-js | 1.5.6 | 1.6.8 | Actualizar su padre solid-js de 1.9.15 a 1.9.17; se elimina la copia vulnerable y se reutiliza la raíz corregida. |
| sharp | 0.35.4 | 0.35.5 | Wrangler 4.147.0 → 4.149.0, que incorpora miniflare 5.20261006.1-alpha con sharp corregido. |
| shell-quote | 1.10.0 | 1.12.0 | Dentro del rango admitido por launch-editor. |
| smol-toml | 1.8.0 | 1.9.1 | Dentro del rango admitido por knip, sin ampliar la actualización a todo knip. |
| source-map-js | 1.2.1 | 1.2.2 | Parche dentro de los rangos existentes de Tailwind/PostCSS. |

Se mantienen Vite **8.3.3**, Rolldown **1.2.11**, el pin de Bun **1.4.2** en CI y el guard de
antigüedad de **24 horas** de `bunfig.toml`, sin nuevas excepciones. Parser 7.1.7 y
Wrangler 4.151.3 se publicaron el mismo día y no son necesarios para corregir el lote.
Seroval 1.6.11 tampoco es necesario: 1.6.8 ya corrige los dos avisos inventariados.
Wrangler 4.148.0 todavía incorporaba sharp 0.35.4; 4.149.0 es el primer padre estable
posterior comprobado que contiene la corrección. Sus dependencias workerd y esbuild
se actualizan conjuntamente; la copia esbuild de tsx se deduplica a 0.28.2 dentro de
su rango declarado.

## Overrides transitorios y salida

- `esbuild → 0.28.2`: drizzle-kit 0.31.11 sigue siendo la última estable
  consultada y conserva el loader legado. No se salta a Drizzle 1.0 RC. La regla
  plana es necesaria porque el Bun 1.3.3 observado en el sandbox de Lovable no
  admite reglas por padre ni lock v3. No rebaja las copias 0.28.2 de Wrangler/tsx;
  cambia además la copia de Drizzle 0.25.12 a 0.28.2. Se prueba el consumidor real:
  configuración y esquema TypeScript con importación local, generación de SQL
  ficticio, comprobación del journal e idempotencia, siempre offline. El control
  previo con 0.25.12 produce el mismo SQL. Retirar el override cuando un Drizzle
  estable quite el loader vulnerable, o restringirlo al padre cuando los
  instaladores efectivos soporten esa capacidad y se repitan las pruebas.
- `postcss-selector-parser → 7.1.6`: typography 0.5.20 sigue siendo la última
  estable y fija 6.0.10. Es su único consumidor en este árbol. Se prueba su API y
  equivalencia de selectores y de los objetos completos de componentes/variantes,
  además del build CSS real. Retirar el override cuando el padre adopte una versión
  corregida. Existe un backport upstream 6.1.5, pero el aviso consultado todavía
  clasifica `<7.1.6` como afectado. La elección se apoya en compatibilidad probada,
  no sólo en silenciar el aviso.

### Compatibilidad del lock con la plataforma

La primera propuesta con overrides por padre generaba formato 3. El binario oficial
Bun 1.3.3, contrastado por SHA512 con npm, rechazó ese formato y el formato 2.
También se probó regenerar nativamente desde el lock base v1: conservaba copias
anidadas vulnerables y su comando update agregaba los nombres transitivos como
nuevas dependencias directas. Se descartó ese resultado. La migración oficial vía
Yarn tampoco preservó la semántica del lock ni pasó frozen.

El candidato final conserva el grafo de reglas planas resuelto por Bun 1.4.2,
serializado en formato 1 sin cambiar versiones, fuentes, integridades ni rutas.
La diferencia v2/v1 documentada por Bun son dos validaciones de parseo. Antes de
emitir el formato legado se comprobó de forma fail-closed que los 1.332 registros
son paquetes de registry con SHA512 válido, sin Git, aliases tarball/locales,
credenciales en URL ni fuentes nuevas. Los dos registros del mirror europe-west1
y sus hashes ya existían idénticos en la base. No se eliminó ninguna integridad.
El conversor reproducible y sus controles negativos se conservan como evidencia
de revisión; no se cambia el instalador permanente ni se añade un workflow.

Instalaciones limpias `--frozen-lockfile` con **Bun 1.3.3 y 1.4.2** instalan 891
paquetes y dejan manifest/lock idénticos por SHA256. Las pruebas de resolución real,
Drizzle y CORS pasan en ambos árboles. El sandbox observado no demuestra cuál es
el instalador del hosting, pero se elimina el bloqueo del formato en las dos
versiones comprobadas. Para futuras actualizaciones, no aceptar una conversión de
encabezado sin validar todas estas invariantes y repetir ambas instalaciones.

## Reproducción y alcance

En un checkout limpio, con Node 24 y Bun 1.4.2:

```sh
bun install --frozen-lockfile
bun run test:dependencies
bun audit --json
bun audit --prod --json
bun run lint --max-warnings=0
bun run typecheck
bun run typecheck:browser-tests
bun run arch:check
bun run test:coverage --maxWorkers=2
```

La instalación debe ser limpia: en esta revisión, `bun install` incremental dejó una
carpeta anidada obsoleta de esbuild 0.18.20 aunque el lock y la auditoría ya eran
correctos. Un nuevo checkout con `bun install --frozen-lockfile` resuelve core-utils
al esbuild 0.28.2 esperado; el nuevo test comprueba resolución real para detectar
ese caso. La auditoría sola no sustituye la verificación del árbol instalado.

Build y pruebas de navegador usan exclusivamente backend ficticio de loopback,
sin autenticación ni siembra de datos de producción. Las pruebas de herramientas
son locales y no aplican migraciones. Cero avisos en el lock no implica demostrar
inexistencia de todas las vulnerabilidades o explotabilidad previa en producción.

## Validación e integración

- Auditoría completa: 9 familias, 17 entradas (14 GHSA únicos) antes; 0 después.
  Auditoría de dependencias de producción: 0 después.
- Instalación limpia y congelada con Bun 1.3.3 y 1.4.2; resolución real de
  consumidores, Drizzle offline e invariantes del lock pasan. Las 62 pruebas de
  herramientas CI también pasan.
- La propuesta inicial con reglas por padre pasó ESLint sin advertencias, tipos
  de aplicación/navegador, arquitectura, journal, changelog y build de producción
  con backend ficticio. Al repetir lint y tipos globales para la variante compatible,
  ambos procesos terminaron con SIGKILL/137 durante presión de memoria, sin resultado
  de calidad. El lint explícito de los archivos tocados sí pasa sin advertencias.
  No se repitió el build local para esta variante; CI debe cerrar lint, tipos,
  build y los demás gates globales sobre el commit final.
- Revisar el resultado terminal de la suite completa con cobertura y los umbrales
  originales. Un progreso parcial no constituye un pase.
- En la propuesta inicial, smoke estándar se bloqueó al enumerar interfaces en Wrangler. Con puertos
  loopback explícitos, el build real arranca, pero Chromium falla al crear su socket
  antes de ejecutar los 6 casos. Móvil 360/390 requiere el mismo navegador y queda
  pendiente. No se cambió código, configuración versionada ni gates para ocultarlo.
- Antes de fusionar/publicar, cerrar cobertura, smoke, móvil y revisión de
  dependencias en CI; verificar además el instalador efectivo de Lovable.

No se modifican workflows ni permisos. `test:dependencies` se ejecuta explícitamente;
este lote no añade un paso nuevo al workflow existente. La preparación local no
implica que se haya creado un PR, fusionado una rama o publicado una versión.

## Revisión de cadena de suministro

Se contrastaron las 70 versiones únicas nuevas/modificadas del lock inicial contra
el registry oficial npm: las 70 integridades SHA512 coinciden. La variante compatible
no incorpora versiones únicas adicionales; únicamente reutiliza esbuild 0.28.2 y
elimina copias de la rama 0.25.12. No se encontraron
paquetes nuevos marcados como deprecated. sharp instalado informa librsvg 2.63.2
y libvips 8.18.7; la conversión local de un SVG sintético a PNG pasa.

Las distribuciones opcionales de libvips conservan licencia `LGPL-3.0-or-later`,
ya presente en la versión anterior. La lista permitida del gate remoto de
dependencias no incluye esa licencia. No se cambió la política ni se suprimió el
gate: el resultado remoto debe revisarse antes de integrar/publicar.

## Fuentes primarias

- [Bun: overrides y formatos de lock](https://bun.com/docs/pm/overrides).
- [Bun 1.4: cambios del formato v2](https://bun.com/blog/bun-v1.4) y
  [cambio upstream de las validaciones de parseo](https://github.com/oven-sh/bun/pull/31539).
- [esbuild: GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
- [Parser: GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
- [Backport del parser a 6.x](https://github.com/postcss/postcss-selector-parser/pull/346).
- [Seroval: GHSA-p6vx-979v-rg4c](https://github.com/advisories/GHSA-p6vx-979v-rg4c)
  y [GHSA-jp82-f5mq-hwhp](https://github.com/advisories/GHSA-jp82-f5mq-hwhp).
- [sharp: GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- Versiones, fechas y dependencias: [registry oficial npm](https://registry.npmjs.org/).
