# Ejecutor temporal Facturapi 6: sandbox de ELOGISTIX SHIPPING

Estado: **preparado para revisión. No está desplegado.** Esta carpeta está fuera de `supabase/functions`, así que ningún despliegue la incluye.

## Qué contiene
- `snapshot/`: copia byte a byte de `hlopezb83/liftgo@967ac99ce632c284fc35f9a7a62852ab4fd09dcf` (PR #438): el cierre de imports de `stamp-cfdi`, `stamp-payment-complement`, `stamp-credit-note`, `cancel-cfdi` y `download-cfdi`, el adapter Facturapi 6, `sdk6_contract_test.ts`, `deno.json` y `deno.lock`. No se modifica.
- `MANIFEST.json`: 39 archivos con SHA-256, hash del tarball y `closure_sha256` (líneas `path:sha256\n` en orden).
- `RUNNER_MANIFEST.json`: hashes del ejecutor (`runner/`, `deno.json`, `.gitignore`).
- `.gitignore`: reincluye `snapshot/**/deno.lock`, que el gitignore global del entorno ignoraba (por eso faltó en 867c6f3e).
- `runner/`: `policy.ts` (política cerrada), `guards.ts` (identidad estricta y vista restringida de secretos), `claims.ts` (claims durables), `phases.ts` (fases con efecto, cerradas), `preflight.ts` (fase 0), `index.ts` (entrada).

## Política cerrada
- La petición acepta sólo `{action, run_id}`; cualquier otro campo se rechaza con 400.
- Empresa fija `fc2c10e3-278b-4899-8aa1-f802752f1c38`; emisor esperado `ELOGISTIX SHIPPING` con RFC igual a `company_settings.rfc`.
- **Ventana fija y corta** (`policy.ts`): `RUN_NOT_BEFORE`–`RUN_EXPIRES_AT`, máximo 6 h, validada en cada petición y otra vez justo antes de cada efecto. El caller no puede renovarla. Valor propuesto: 2026-11-10 16:00–20:00 UTC; debe fijarse en el commit revisado justo antes del despliegue. Fuera de ella: 410 antes de autenticar.
- Topes: 116 MXN por documento, cantidad 1, máximo 4 CFDI por run (el plan usa 3).
- `WRITE_PHASES_ENABLED = false` y `DURABLE_CLAIMS_GUARANTEED = false`: sólo `preflight` puede ejecutarse.

## Identidad estricta (`runner/guards.ts`)
Envuelve `authenticateWithDeps` y `resolveCallerOrganization` sin modificarlos. Falla cerrado ante:
- token ausente o error de `getClaims`; rol del JWT distinto de `authenticated` (rechaza `service_role`, `anon` y cron);
- `sub` vacío, no UUID o distinto del usuario del snapshot;
- perfil ausente, error, duplicado o `is_active !== true` (`null` también falla; el snapshot sólo rechazaba `false`);
- rol no admin; membresía interna ausente, múltiple o ajena; empresa inactiva o con `is_active` nulo.

## Credenciales
- Se lee `company_settings.facturapi_mode` primero; si no es `test`, 409 **sin tocar `billing_secrets`**.
- El snapshot recibe una vista del cliente de servicio que reescribe todo `select` de `billing_secrets` a sólo `facturapi_test_key` y lanza si algo filtra por la columna live: la llave live nunca llega al isolate.
- El entorno visible oculta toda variable `FACTURAPI*`.
- Respuestas y errores sólo llevan códigos: ninguna llave, fragmento, RFC ni razón social.

## Fase 0 (`preflight`)
Sólo lecturas en la base y `GET /v2/organizations/me` (SDK 6, 15 s, sin reintento). Responde booleanos.

## Fases con efecto (`runner/phases.ts`): implementadas y CERRADAS
Invocan los handlers auténticos del snapshot por sus interfaces de inyección; no hay flujo SDK alterno.

| Acción | Handler | CFDI nuevos |
|---|---|---|
| `stamp_invoice` | `stamp-cfdi` | 1 |
| `payment_and_rep` | `stamp-payment-complement` | 1 |
| `credit_note` | `stamp-credit-note` | 1 |
| `download_pdf_xml` | `download-cfdi` (xml) | 0 |
| `cancel_run_invoice` | `cancel-cfdi`, motivo 02, sólo la factura del run | 0 |
| `duplicate_request` | `stamp-cfdi` sobre la misma factura; éxito = rechazo 4xx | 0 |
| `retrieve_and_update_status` | **bloqueada**: vive en `refresh-cancellation-status`, fuera del cierre revisado | 0 |

Secuencia por fase: compuertas → ventana y cierre durable → fixtures válidos (tenant, run_id, montos ≤116, cantidad 1) → claim único → revalidar ventana y cierre → una sola llamada al handler. Excepción, timeout o estado inesperado ⇒ marcador de cierre irreversible y 409, sin reintento. El `fetch` del handler sólo permite `https://www.facturapi.io` y el propio backend; los handlers reciben la misma vista restringida de secretos y entorno.

**Pendiente, fixtures:** la creación de cliente, factura y pago ficticios del run no está implementada. Sin manifiesto de fixtures, cada fase responde `fixtures_missing_or_invalid` antes de reservar. Requiere un diseño revisado de inserción acotada.

## Claims durables: BLOQUEO
`claims.ts` crea objetos `upsert:false` en el bucket privado existente `cfdi-files`, bajo `qa-fx6-sandbox/<RUN_ID>/claims/<acción>.json` y `.../disabled.json`; nunca sobrescribe ni borra. Lecturas pasivas del 2026-11-10:
- Bucket privado con índice único sobre (bucket, nombre) del objeto vigente: crear con `upsert:false` es atómico (409 si existe).
- El prefijo no lleva organización: la RLS de usuarios no lo alcanza.
- **No es inmutable:** el cliente de servicio puede actualizar o borrar; con prefijo de organización, las políticas de `cfdi-files` dan UPDATE/DELETE a admin/administrativo; y `migrate-storage-org-prefix` borra objetos sin prefijo al migrarlos. Borrar un claim o el marcador permitiría repetir una acción o reabrir el run.
- Por eso `DURABLE_CLAIMS_GUARANTEED` sigue en false. Garantizarlo requiere almacenamiento de sólo inserción (migración), que no se agregó.

## Cron y colas: BLOQUEO
`cron.job` (lectura pasiva): `reconcile-stamping-invoices-5min` (`2-59/5`) y `process-cfdi-retry-queue-5min` (`*/5`) están activos y son globales. Si un handler deja un documento en `stamping` tras un timeout, el reconciliador puede tomarlo en ≤5 min; no existe mecanismo verificable para excluir fixtures. Mitigación: cada fase dura segundos y no encola; ante incertidumbre el run se cierra y el documento sólo se consulta por su ID.

## Identidad para la ejecución futura
Según la descripción de `supabase--curl_edge_functions` (no se llamó):
- Con sesión del usuario en la vista previa, envía ese token.
- Si sólo conoce la identidad, acuña un token corto con `sub`, email y rol `authenticated`, sin `session_id`, metadatos ni `aal`; no está verificado que `getClaims` lo acepte.
- Sin sesión, la petición va sin autenticación (el ejecutor responde 401). Un `Authorization` propio sustituye al inyectado.
- La herramienta no informa qué usuario usó; sólo se verifica por la respuesta del ejecutor (exige admin activo de ELOGISTIX), sin revelar el ID.
- Mecanismo interno existente, sólo para revisión: la CLI de sesión del agente puede acuñar una sesión de un usuario existente con aprobación del usuario. No se usó; no crea usuarios ni cambia roles.

## Pruebas locales sin red
`deno test --config deno.json --frozen --allow-read=. --allow-env=ALLOWED_ORIGINS,SENTRY_DSN,SENTRY_ENVIRONMENT,DENO_DEPLOYMENT_ID,SB_EXECUTION_ID runner/ snapshot/supabase/functions/_shared/facturapi/sdk6_contract_test.ts` (sin `--allow-net`): 37/37. `manifest_test.ts` verifica los 39 archivos y `closure_sha256` desde el checkout, incluido `deno.lock`; `--frozen` falla si el lock no coincide.

## Plan de despliegue (aprobación aparte)
1. Fijar la ventana en `policy.ts`; verificar ambos manifiestos y `git diff` vacío fuera de esta carpeta.
2. Copiar `runner/` y `snapshot/supabase/functions/**` a `supabase/functions/fx6-sandbox-probe/` con `deno.json` y lock propios.
3. Desplegar sólo `fx6-sandbox-probe`, registrar el recibo e invocar una vez `preflight`. Si `preflight_ok` no es `true`, detener.

## Deshabilitación comprobable
Borrar la función con la herramienta oficial, retirar la carpeta copiada y comprobar que no aparece y que una petición recibe 404 de plataforma. Respaldo: la ventana responde 410 al vencer.

## Fuera de alcance
Sin cron, colas, correos ni dinero; sin cambios en RLS, roles, JWT, bucket ni configuración de seguridad.
