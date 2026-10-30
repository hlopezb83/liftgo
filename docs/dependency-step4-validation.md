# Supabase 2.118.0 — validación y traslado

Este lote se apila sobre `27aff7c10156edb369bd062e8135b6326a564a63`.
Fija `@supabase/supabase-js` y sus cinco clientes internos en 2.118.0, la
estable revalidada para este lote. Node debe ser 24.22.1 y Bun 1.4.4,
como indican los archivos del repositorio. El SDK requiere Node >=22.

Los contratos usan el SDK instalado con respuestas sintéticas y transportes
ficticios: Auth/UUID/MFA, query/RPC, errores y cancelación, Storage con
`content-encoding` y Realtime con cierre sin reconexión. No necesitan backend,
credenciales ni datos operativos. Las regresiones heredadas de esbuild y
HappyDOM arrancan únicamente servidores locales ficticios.

## Comandos Linux

```sh
bun install --frozen-lockfile
bun run test:dependencies
bun run typecheck
bun run typecheck:browser-tests
bun run lint
bun run build
```

Ejecutar después los carriles y agregadores existentes de CI, con sus selectores
y controles intactos. Revisar RAM disponible antes de dimensionar workers y heap.
Los comandos anteriores no sustituyen el agregador completo, RLS ni un evento
pull_request de GitHub. No ejecutar migraciones o pruebas contra bases operativas.

## Resultado local y límites

Instalación congelada con hash estable, 21/21 contratos Node, tipos de aplicación
y browser-tests, build y lint global sin errores ni warnings: PASS en Windows.
El build emitió warnings del bundler. No se ejecutaron aquí las suites completas
de Linux/Cloud, RLS ni las regresiones frontend completas; quedan para el CI
del traslado. No se ejecutó despliegue ni carga de sourcemaps a Sentry.

Los siete imports productivos Edge y sus cinco imports de pruebas/fixtures
permanecen fuera de este lote, con el lock Edge previo en 2.117.2. Los consumidores
raíz sí resuelven 2.118.0. La auditoría completa del grafo raíz no se transmitió
a npm; no se afirma cero avisos nuevos.

Se conservan Zod 3 del plugin Compiler y Solid/Seroval 1.6.12. Retirar el plugin
Compiler perdió detecciones en pruebas de contraste y no se hizo. Seroval 1.7.3
es una republicación con provenance; su resolución está bloqueada por la
protección de 24 horas de `bunfig.toml`, que no se relajó. No se fuerza Seroval
1.7 sobre el rango `~1.6.8` de Solid ni se repiten descargas RLS limitadas de ECR.

Fuentes: [Supabase 2.118.0](https://github.com/supabase/supabase-js/releases/tag/v2.118.0),
[tabla Auth GHSA](https://github.com/supabase/auth-js/security/advisories/GHSA-8r88-6cj9-9fh5),
[Seroval 1.7.3](https://github.com/lxsmnsyc/seroval/releases/tag/seroval@1.7.3).
