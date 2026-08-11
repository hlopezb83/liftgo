# Arreglar el arranque de Supabase local en rls-db-tests

## Situación

El job falla 8/9 en `main` siempre en el mismo paso: **Start Supabase (solo DB + auth)**. Nunca llega a `db reset` ni a las suites.

No pude leer todavía el output del step "Diagnóstico de arranque" del último run: no hay conexión de GitHub en el workspace (solo Firecrawl) y la tarjeta de conexión quedó cancelada. Sin esa evidencia, la causa raíz exacta sigue **sin confirmar**, así que el plan empieza por obtenerla y solo después decide el fix definitivo.

Lo que sí está verificado leyendo el repo:

- El workflow pinea la CLI a `2.34.0` (`supabase/setup-cli` + caché con esa versión en la key).
- El arranque corre `supabase start -x studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,mailpit,postgres-meta,supavisor --debug` con `timeout-minutes: 15`.
- `supabase/config.toml` **no declara ninguna sección de servicios**: solo `project_id` y los bloques `[functions.*]` con `verify_jwt`. No hay `[db]`, `[auth]`, `[api]` ni `[analytics]`, por lo que cada versión de la CLI elige por su cuenta las imágenes Docker y sus versiones — justo el escenario de deriva CLI vieja / imágenes nuevas.

## Paso 1 — Evidencia (bloqueante)

Conseguir el bloque de `docker logs` del step de diagnóstico del último run fallido en `main`, por cualquiera de estas vías:

- Conectar el conector de GitHub (vuelvo a abrir la tarjeta) y leer el log del run por API, o
- que me pegues el contenido del step "Diagnóstico de arranque (solo en fallo)".

Con eso se identifica cuál contenedor queda unhealthy (`supabase_db`, `supabase_auth`, `supabase_kong`, `supabase_rest`) y con qué error.

## Paso 2 — Fix según la evidencia

### Caso A: incompatibilidad CLI vieja / imagen nueva (hipótesis 1)

1. Subir `supabase/setup-cli` a la última estable y actualizar la key de caché `~/.local/share/supabase-cli` a esa versión.
2. Revalidar la lista `-x` contra `supabase start --help` de la nueva versión antes de confirmar (un nombre inválido aborta el start).
3. Anclar el entorno en `supabase/config.toml` para que el arranque deje de depender de defaults cambiantes:
   - `[db] major_version` fijo,
   - `[analytics] enabled = false` (evita logflare/vector, que son la fuente habitual de arranques colgados),
   - `[studio] enabled = false`, `[storage] enabled = false`, `[edge_runtime] enabled = false`, `[realtime] enabled = false`.
   Con esos flags en config, la lista `-x` deja de ser la única defensa y el arranque se vuelve reproducible entre versiones de CLI.

### Caso B: un servicio queda unhealthy (hipótesis 2)

- Si es `gotrue`/`kong`: añadir la sección `[auth]` mínima que la CLI espera (`enabled = true`, `site_url`, `jwt_expiry`) y las variables que el log señale.
- Si es solo lentitud del runner: subir el `timeout-minutes` del step y, como red de seguridad, correr el start con la opción de ignorar el health-check de servicios no críticos, dejando que `db reset` sea el verdadero gate.

### Caso C: conflicto de puertos/recursos (hipótesis 3)

- Fijar puertos explícitos en `[api]`/`[db]` de `config.toml` distintos de los que ya ocupa el runner, según lo que muestre `docker ps -a`.

## Paso 3 — Verificación

- Ejecutar el workflow por `workflow_dispatch` en `main` y confirmar: arranque OK → `db reset` aplica todas las migraciones → **34 suites** de `supabase/tests/rls/` ejecutadas y verdes → JUnit publicado.
- No se tocan `db reset`, `scripts/run_sql_suites.py`, `scripts/patch_legacy_migrations.py` ni la publicación de resultados.

## Paso 4 — Válvula de escape

Si tras **2 intentos** el arranque sigue fallando: dejar el workflow solo en `workflow_dispatch` (quitando los triggers `push`/`pull_request`), con un comentario `TODO` que enlace el diagnóstico y una issue de seguimiento, para no dejar `main` permanentemente rojo. Es la última opción, no la primera.

## Detalles técnicos

- Archivos a tocar: `.github/workflows/rls-db-tests.yml` (versión de CLI, key de caché, timeout/flags del start) y `supabase/config.toml` (secciones de servicios y versiones de imagen).
- Riesgo de `config.toml`: es un archivo gestionado por la plataforma para el proyecto Cloud; solo se añadirán secciones de entorno **local** (`[db]`, `[auth]`, `[analytics]`, `[studio]`, etc.), que no alteran el backend en producción, y se documentará en el propio archivo.
- Changelog: entrada patch al cerrar el fix (CI verde), como en `v7.297.1`.
