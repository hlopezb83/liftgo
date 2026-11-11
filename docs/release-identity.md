# Identidad del release de Lift GO

La versión semántica no identifica por sí sola el código publicado. El prebuild
calcula `sourceSha256` y lo escribe en `version.json`; Vite incorpora la misma
huella en el cliente (`__LIFTGO_SOURCE_ID__`). No necesita `.git`, variables de
hosting ni secretos. La huella es pública, no una firma ni una credencial.

## Alcance

`source-v1` incluye rutas ordenadas y SHA256 de los archivos de `src`, `public`,
`scripts`, `supabase/functions`, `drizzle/migrations` y los cinco manifiestos de
fuente/configuración declarados en `scripts/release-identity.mjs`. Excluye sólo
salidas generadas de versión, caches, `.env*`, directorios de credenciales,
claves/certificados privados (`pem/key/p12/pfx`), `credentials.json` y logs. Rechaza symlinks, entradas
especiales, raíces ausentes y presupuestos excedidos. La identidad es de entradas
revisadas, **no** un hash reproducible de bytes del bundle: el hosting y variables
públicas del build pueden producir artefactos distintos con las mismas fuentes.

Aunque incluye las fuentes Edge y SQL, publicar el frontend **no acredita** que
esas funciones o migraciones estén desplegadas. Éstas necesitan su propio recibo
con definiciones/hashes, permisos y verificaciones antes/después.

## Gate de aceptación antes y después de publicar

1. Abrir el CI verde de `main` para el commit a publicar. El resumen de
   **Build y smoke** muestra el commit y el JSON de identidad del código probado.
   Guardar esos datos y el enlace del run en el recibo de aprobación.
2. Comprobar que Lovable está sincronizado con ese commit y ejecutar
   `node scripts/release-identity.mjs` en el checkout que se va a publicar.
   Exigir la misma versión y huella que en el resumen de GitHub. Si aparece
   un nuevo commit con cambios de fuente, usar su propio run de CI.
3. Publicar mediante el canal autorizado. No reutilizar un checkout antiguo.
4. Ejecutar Playwright con `playwright.prod-smoke.config.ts` y pasar los valores
   aprobados como `LIFTGO_EXPECTED_SOURCE_ID` y `LIFTGO_EXPECTED_VERSION`. Ambas expectativas son
   obligatorias para una aceptación. El smoke conserva su aislamiento de red,
   sin sesión, backend ni escrituras, y obtiene el manifiesto con `no-store`.
5. Deben coincidir versión esperada, huella esperada, manifiesto servido y huella
   compilada del navegador. Bundle viejo coherente, mezcla por caché, campos
   ausentes o sólo una expectativa fallan. Guardar run terminal y volver a
   comprobar que no hubo deriva de fuente durante la publicación.

## Contratos de dependencias

CI ejecuta `test:dependencies` en un único job cuando cambian package.json,
bun.lock, la suite, el instalador o el workflow, y en dispatch manual. Se mantiene
la instalación frozen, la revisión de vulnerabilidades y el guard de antigüedad.
No se añaden dependencias ni permisos. El job termina fallido si la suite detecta
resolución inesperada, una versión fuera del contrato o comportamiento inválido.

Every Vite config load recomputes the identity and rejects a stale or missing prebuild manifest, including direct Vite and build:dev invocations. Run the existing prebuild step after source edits; a stale manifest cannot relabel new code as an older source tree.
