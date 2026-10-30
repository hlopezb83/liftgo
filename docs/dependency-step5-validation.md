# TanStack Query 5.105.0 — validación local

Registro local completado el 29 de octubre de 2026, anterior a la publicación
de la rama. Los resultados remotos posteriores se registran en el PR; este
documento no los acredita.

Lote exclusivo de Lift GO, rama `chore/query-latest-step5-cloud-20261029`.
Base exacta de PR 357: `eed448e4ef74c23066480c81a0b79259ef615bcc`.
Al inspeccionar GitHub, `main` era `68db6f4f9a75634742eec2a90cb1960f4e83bcbe`
y PR 358 era `1ea4ba9590cff540c4e0be0cfcf3ec6b0f145c52`; este último sólo
añade el arreglo del fixture JWT. No se incorporaron PR 360
(`6c9da61b37a0172e87599c1e8e3985681bba4674`) ni WIP
`6013ed83a875262e975a3339b7767eadd89d1833`.

## Alcance y fuentes

Las cuatro dependencias directas pasan de `^5.104.3` a `5.105.0` exacto:

- `@tanstack/react-query`
- `@tanstack/react-query-devtools`
- `@tanstack/react-query-persist-client`
- `@tanstack/query-sync-storage-persister`

El lock actualiza esas cuatro y las internas `@tanstack/query-core`,
`@tanstack/query-devtools` y `@tanstack/query-persist-client-core`, todas de
5.104.3 a 5.105.0. Las otras 1.311 entradas del lock permanecen iguales.
Los rangos externos de Devtools, incluidos Solid y Kobalte, no cambian.
No hay migración mayor ni cambios de código de aplicación.

El [release oficial del 26 de octubre de 2026 a las 09:32 UTC](https://github.com/TanStack/query/releases/tag/release-2026-10-26-0932)
era la última estable al revisarlo el 29 de octubre y superaba las 24 horas.
Los [peers oficiales](https://github.com/TanStack/query/blob/release-2026-10-26-0932/packages/react-query/package.json)
admiten React 18/19 y tipos de React opcionales 18/19. La
[documentación TypeScript del mismo tag](https://github.com/TanStack/query/blob/release-2026-10-26-0932/docs/framework/react/typescript.md)
requiere 5.7 o posterior y recomienda versión exacta. El proyecto conserva
React 19.3.1 y TypeScript 6.0.3.

## Instalación y entorno

Node 24.22.1 y Bun 1.4.4 se descargaron de nodejs.org y del release oficial
de Bun, respectivamente. Se verificaron sus SHA256 oficiales:

- Node Linux x64: `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`.
- Bun Linux x64: `bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c`.

Se reutilizó una copia de la caché precargada del mismo contenedor. La
instalación frozen completó 450 instalaciones pendientes y descargó los
faltantes desde los destinos autorizados del lock. Se conservaron sus URLs e integridades; no se cambiaron
mirrors ni se desactivó la verificación de integridad. Las siete distribuciones
Query también se contrastaron con los manifiestos y SHA512 de npm.

El lock preparado inicialmente desde esos manifiestos quedó después validado
por Bun: `bun install --frozen-lockfile` PASS y repetición
`bun install --offline --frozen-lockfile` PASS, sin cambios. SHA256 antes y
después: `6b7f37dd69b60762b1ba317cfcae0317a290fa230da98ec58d9d5151371139e2`.
Las siete resoluciones instaladas se comprobaron desde sus consumidores reales.
El guard `minimumReleaseAge = 86400` y sus exclusiones existentes no cambian.

## Comprobaciones

Todas usan los runtimes indicados, entorno de aplicación limpio y backend
ficticio loopback. El build usa token Sentry vacío y no sube sourcemaps.
Las pruebas de navegador reutilizan ese build y Chromium local 154.0.8037.57.

| Comprobación | Resultado |
| --- | --- |
| Frozen normal y frozen offline | PASS, hash del lock estable |
| Contratos de dependencias | PASS, 21/21 |
| Regresiones Query existentes: persistencia, identidades, cancelación, permisos e invalidación | PASS, 42/42 en 10 archivos |
| Tipos de aplicación y pruebas de navegador | PASS |
| ESLint global con `--max-warnings=0` | PASS |
| Arquitectura | PASS |
| Identidad de release, ESLint y contratos AST/blob/tipos | PASS, 127/127 |
| Build | PASS |
| Smoke | PASS, 6/6 |
| Aceptación móvil | PASS, 20/20 |
| Aceptación Nueva factura | PASS, 24/24 |
| Suite completa con cobertura y umbrales existentes | PASS, 5.490/5.490 en 748 archivos; cero omitidas |

Cobertura global: líneas 63,74 %, sentencias 62,02 %, funciones 52,88 % y
ramas 55,05 %. Se aplicaron los umbrales globales y por directorio existentes,
sin modificarlos. Duración de la suite: 657,37 segundos.

El build emite avisos de tamaño de chunks, directivas `use-client` y
`fontkit.open` no exportado; no se hizo un build base de contraste. Workerd
emitió avisos DNS durante la aceptación, sin afectar las aserciones del smoke.

Una invocación enfocada inicial de Vitest rechazó `--minWorkers` antes de ejecutar
pruebas; la ejecución enfocada corregida usa `--maxWorkers=2`. La suite completa
con cobertura usa `--maxWorkers=3`. El primer smoke no llegó
a ejecutar pruebas porque Wrangler intentó crear su configuración fuera del
directorio escribible; se resolvió con `XDG_CONFIG_HOME` y `XDG_CACHE_HOME` en
`/tmp`, sin cambiar configuración del repositorio. El primer intento de
instalación en red se canceló sin resultado al faltar el transporte proxy en
el entorno limpio; el frozen posterior conservó proxy/CA de la plataforma y
excluyó variables de aplicación y credenciales.

## Auditoría y límites

Se envió al endpoint bulk de npm únicamente un mapa de nombres y versiones:
961 nombres y 1.083 pares únicos procedentes de las 1.318 entradas del lock,
incluidas copias internas y alternativas de plataforma. HTTP 200. El resultado
no es una auditoría limpia: npm mantiene un aviso HIGH para la copia heredada
`zod@3.25.76` de `eslint-plugin-react-compiler`, dependencia de desarrollo;
Zod raíz permanece corregido en 4.6.7. Esa copia no cambia en este lote.

El [aviso oficial](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) sigue activo
en npm/GitHub. El mantenedor solicita retirarlo tras el rechazo del CVE fuente;
la [solicitud](https://github.com/github/advisory-database/pull/10750) seguía
abierta. Existe un [backport a 3.25](https://github.com/colinhacks/zod/pull/6699)
sin incremento de versión. No se eliminó Compiler ni se forzó Zod 4 sobre su API.

La auditoría se refiere al lock, no exclusivamente a los paquetes instalados
en Linux. Los PASS locales no acreditan CI remoto completo, RLS ni Dependency
Review de un evento PR. No se ejecutó la prueba SQL de PR 360 que el usuario
dejó pendiente, ni bases operativas, merge o despliegue. No se
modificaron pruebas, migraciones, linter SQL, accesos ni controles de seguridad.
La [validación previa documentada en PR 357](https://github.com/hlopezb83/liftgo/pull/357)
incluye fallos de lint SQL histórico, el fixture JWT histórico de Gitleaks y
RLS por límite de descarga Docker. Este lote no los corrige ni incorpora el
arreglo JWT separado de PR 358.

Los logs, JSON de auditoría y checksums de esta sesión están en
`/tmp/liftgo-query-step5` y `/tmp/liftgo-runtime-20261029` del contenedor de
validación. No son enlaces a un CI remoto.
