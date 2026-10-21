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

1. Obtener el checkout exacto aprobado por CI. Verificar que no tiene cambios de
   fuentes pendientes y que el HEAD remoto y Lovable no cambiaron. Si hay deriva,
   detener y reconciliar; nunca restaurar ni publicar automáticamente sobre otros.
2. Ejecutar `node scripts/release-identity.mjs` desde ese checkout. Guardar su
   JSON junto con commit, árbol y runs de CI en el recibo de aprobación. No tomar
   el valor esperado de `version.json` del sitio que se va a comprobar.
3. Publicar mediante el canal autorizado. No reutilizar un checkout antiguo.
4. Ejecutar el workflow **Prod smoke** manual con `expected_source_sha256` y
   `expected_version` del paso 2, o ejecutar su Playwright equivalente con
   `LIFTGO_EXPECTED_SOURCE_ID` y `LIFTGO_EXPECTED_VERSION`. Ambas expectativas son
   obligatorias para una aceptación. El smoke conserva su aislamiento de red,
   sin sesión, backend ni escrituras, y obtiene el manifiesto con `no-store`.
5. Deben coincidir versión esperada, huella esperada, manifiesto servido y huella
   compilada del navegador. Bundle viejo coherente, mezcla por caché, campos
   ausentes o sólo una expectativa fallan. Guardar run terminal y volver a
   comprobar que no hubo deriva de fuente durante la publicación.

El cron horario sin baseline comprueba **coherencia**, no aprobación de una
publicación. No compara contra el último main porque éste puede adelantarse
legítimamente al despliegue. Tampoco cambia permisos de rama ni obliga a Lovable
a pasar por este gate: esos controles externos no se han verificado. Para cerrar
una entrega no basta el cron; es obligatorio el paso de aceptación explícita.

## Contratos de dependencias

CI ejecuta `test:dependencies` en un único job cuando cambian package.json,
bun.lock, la suite, el instalador o el workflow, y en dispatch manual. Se mantiene
la instalación frozen, la revisión de vulnerabilidades y el guard de antigüedad.
No se añaden dependencias ni permisos. El job termina fallido si la suite detecta
resolución inesperada, una versión fuera del contrato o comportamiento inválido.

Every Vite config load recomputes the identity and rejects a stale or missing prebuild manifest, including direct Vite and build:dev invocations. Run the existing prebuild step after source edits; a stale manifest cannot relabel new code as an older source tree.
