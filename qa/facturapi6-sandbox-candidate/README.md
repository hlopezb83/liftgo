# Ejecutor temporal Facturapi 6: sandbox de ELOGISTIX SHIPPING

Estado: **preparado para revisión. No está desplegado.** Esta carpeta está fuera de `supabase/functions`, así que ningún despliegue la incluye.

## Qué contiene
- `snapshot/`: copia byte a byte de los archivos de `hlopezb83/liftgo@967ac99ce632c284fc35f9a7a62852ab4fd09dcf` (PR #438). Incluye el cierre de imports locales de los handlers `stamp-cfdi`, `stamp-payment-complement`, `stamp-credit-note`, `cancel-cfdi` y `download-cfdi`, el adapter `_shared/facturapi/client.ts` y su `sdk6_contract_test.ts`, más el `deno.json`/`deno.lock` del commit.
- `MANIFEST.json`: 39 archivos con su SHA-256, el SHA-256 del tarball de GitHub y `closure_sha256`. Para verificar, se recalcula con las líneas `path:sha256\n` en el orden del manifiesto.
- `runner/`: el ejecutor. `policy.ts` es la política cerrada; `preflight.ts` contiene la fase 0, que ejecuta código auténtico del snapshot (`authenticateWithDeps`, `resolveCallerOrganization`, `getFacturapiConfigForOrganization`, `createFacturapiClient`); `index.ts` es la entrada.
- `deno.json`: import map propio con `facturapi@6.0.0` y el lock congelado del snapshot. **No toca el `deno.json` común ni los 26 endpoints.**

## Política cerrada
- La petición acepta sólo `{action, run_id}`. Cualquier campo extra (ID, URL, monto o empresa) se rechaza con 400.
- La empresa es fija: `fc2c10e3-278b-4899-8aa1-f802752f1c38`. El emisor esperado es `ELOGISTIX SHIPPING`, y su RFC debe coincidir con `company_settings.rfc`.
- El modo debe ser `test` y la llave debe empezar con `sk_test_` y venir de `billing_secrets`. Se rechazan el respaldo por variables de entorno, las llaves live y las llaves de usuario. La regla de llave exclusiva aplica mediante el código del PR.
- Se exige un JWT real con cuenta activa, rol `admin` y membresía interna en esa empresa. `service_role` se rechaza.
- `RUN_ID = fx6-sbx-20261110-01`. La caducidad fail-closed es `2026-11-17T06:00Z`: después de esa hora, todo responde 410 antes de autenticar.
- Topes para fases futuras: total de 116 MXN, cantidad 1 y 4 documentos por ejecución.
- **Sólo está habilitada la acción `preflight`.** Las demás responden 423 `phase_not_enabled`.

## Fase 0 (`preflight`): única que existe hoy
1. Hace sólo lecturas en la base de datos.
2. Hace una sola llamada al proveedor: `GET /v2/organizations/me`, con `organizations.me()` del SDK 6 y un tiempo límite de 15 s, sin reintento.
3. Responde sólo con booleanos: no incluye la llave, el RFC ni la razón social.

## Pruebas locales sin red (ejecutadas)
`deno test --config deno.json runner/ snapshot/supabase/functions/_shared/facturapi/sdk6_contract_test.ts` corre sin `--allow-net`, así que el entorno niega la red al ejecutarse.
- Resultado: 20/20 pruebas pasan.
- Los 8 contratos SDK6 del PR pasan sobre el snapshot.
- La prueba con el SDK 6 real confirma que `me()` hace `GET /v2/organizations/me` y que el signal llega a `fetch`.
- Las 11 pruebas de política cubren:
  - caso correcto con cero escrituras;
  - bloqueo de otra empresa, modo live, llave live, llave de usuario y respaldo por entorno;
  - configuración ambigua o ausente, y llave duplicada;
  - emisor discordante por nombre y por RFC;
  - JWT ausente o inválido, rol no admin y `service_role`;
  - campos extra, run_id ajeno y fases no habilitadas;
  - caducidad, fallo del proveedor sin reintento y concurrencia en el mismo isolate.

## Accesos que usará al ejecutarse
- **Variables de entorno de la función** (ya existentes en el backend): `SUPABASE_URL`, `SUPABASE_ANON_KEY` o la publishable, y `SUPABASE_SERVICE_ROLE_KEY`, leídas por el `supabaseClients.ts` del snapshot. No usa `FACTURAPI_*_KEY`.
- **Lecturas con el cliente de servicio:**
  - `profiles` (is_active) y `user_roles` (role);
  - `organization_memberships` y `organizations` (is_active);
  - `company_settings` (facturapi_mode, razon_social, rfc);
  - `billing_secrets` (facturapi_test_key y la verificación de exclusividad).
- **Escrituras:** ninguna.
- **Red:** sólo `https://www.facturapi.io/v2/organizations/me`.
- **Identidad del caller:** sesión real de un administrador de la empresa. El agente puede usar la sesión del usuario que tenga abierta la vista previa (la herramienta `curl_edge_functions` la inyecta), sin crear usuarios ni tokens. **Bloqueo si nadie tiene sesión de administrador de esa empresa en la vista previa:** no hay modo autorizado y no se alterará el acceso.

## Plan de despliegue (requiere aprobación aparte)
1. Verificar `MANIFEST.json` (`closure_sha256`) y `git diff` vacío fuera de esta carpeta.
2. Copiar `runner/` y `snapshot/supabase/functions/**` a `supabase/functions/fx6-sandbox-probe/`, conservando las rutas relativas.
   - Usar `deno.json` propio dentro de esa carpeta, con el lock del snapshot.
   - Fijar `verify_jwt` por defecto. No editar `config.toml` global salvo la entrada mínima de esa función, si la plataforma la exige.
3. Desplegar **sólo** `fx6-sandbox-probe` y registrar el recibo y el `source_sha256`.
4. Hacer una sola invocación de `{"action":"preflight","run_id":"fx6-sbx-20261110-01"}` con la sesión real del administrador.
5. Si `preflight_ok` no es `true`, detener.

## Plan de deshabilitación comprobable
1. Borrar la función con la herramienta oficial de borrado de funciones.
2. Retirar la carpeta `supabase/functions/fx6-sandbox-probe/`.
3. Comprobar:
   - que la lista de funciones desplegadas ya no la contiene;
   - que una petición sin autenticación devuelve 404 de plataforma, no 401 del handler;
   - que `git diff` no deja nada bajo `supabase/functions/`.
4. Respaldo: la caducidad en el código responde 410 a partir de la fecha límite, aunque el borrado falle.

## Fases de escritura: no implementadas, pendientes de diseño y revisión
Corresponden a CFDI-I, pago y REP, nota de crédito, cancelación de un documento del propio run, retrieve/updateStatus, PDF/XML y la prueba de solicitud doble.
- **Límite real:** los handlers del PR leen y escriben `invoices`, `payments`, `credit_notes`, sus partidas, claims y storage en la **base de producción**, aunque sea con un tenant en modo test.
- Para ejercitarlos de forma auténtica primero hay que crear filas ficticias del run (cliente, factura y pago marcados con `RUN_ID`). Eso es una escritura de datos de negocio que requiere una autorización explícita aparte.
- Ninguna fase podrá recibir IDs: el ejecutor creará y recordará sólo sus propios documentos.
- **Exclusión entre isolates:** el candidato sólo excluye dentro de un mismo isolate. La protección contra duplicados entre isolates depende de los claims de los handlers del PR (estado `stamping`) y no está probada aquí. Una ejecución robusta requeriría un candado persistente en la base (una migración), que queda fuera de este alcance.
- **Distinción:** la fase 0 prueba el SDK y el proveedor más la autenticación y la configuración del ERP. **No prueba** la persistencia de los handlers ni la emisión.
- **Ante un timeout en una escritura futura:** consultar al proveedor por ID o por external_id del run y detener la ejecución. No reemitir.

## Fuera de alcance
Sin cron, colas globales, correos ni dinero, y sin cambios en RLS, roles, JWT o la configuración de seguridad.
