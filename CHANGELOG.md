## [8.29.0] - 2026-09-21 · minor · security

Hasta ahora las funciones internas que siembran y limpian datos de prueba sólo revisaban el rol de administrador, que es global: un administrador de una empresa podía sembrar, limpiar o borrar datos de prueba de otra. El cambio de base 0038 (preparado en Git, NO aplicado) exige un contexto interno único y rol de administrador, escribe siempre la empresa dueña, limpia únicamente lo de esa empresa y elimina la función de borrado global. Se agregan dos pruebas nuevas con dos empresas inventadas.

- Nuevo cambio de base drizzle/migrations/0038_e2e_utilities_tenant_scoped.sql (no aplicado): se elimina e2e_purge_all, se agrega la guarda e2e_require_admin_organization y se reescriben e2e_seed_scenario, e2e_seed_portal_scenario, e2e_teardown, purge_e2e_data y purge_e2e_audit_logs con alcance por empresa, conservando firmas y resultados.
- La configuración allow_e2e_seed se lee sólo de la empresa del llamante; las inserciones llevan la empresa explícita y crean o verifican el enlace de cliente por empresa.
- Permisos: PUBLIC y anon quedan revocados; authenticated sólo conserva las funciones con guarda de empresa y service_role mantiene su acceso.
- Nueva prueba supabase/tests/rls/e2e_utilities_org_scope_ab.sql: dos empresas siembran el mismo alcance y se comprueba que limpiar o purgar en A no lee, cambia ni borra nada de B.
- Nueva prueba supabase/tests/rls/e2e_utilities_contract.sql: impide reintroducir e2e_purge_all y exige guarda de empresa y permisos cerrados en el bloque de utilidades de prueba.
- No se aplicó nada en producción y no se editó ninguna migración histórica; los tipos generados se actualizarán cuando la migración se aplique por el canal oficial.

## [8.28.1] - 2026-09-21 · patch · fix

Al crear una empresa con una contraseña inicial débil, el servicio de autenticación la rechazaba y la pantalla sólo mostraba «No se pudo procesar la solicitud». Ahora la contraseña inicial exige 12-72 caracteres con mayúsculas, minúsculas, números y símbolos (igual que el alta de usuarios internos), el formulario avisa antes de enviar y, si el servicio la rechaza por común o filtrada, se muestra el motivo real.

- src/lib/platformAdmin.helpers.ts: validateCreateInput homologa la regla fuerte de contraseña y createFirstAdminAuthUser traduce el rechazo por contraseña débil a un mensaje explícito.
- src/features/platform/components/PlatformOrganizationDialogs.tsx: validación en el formulario, ayuda actualizada, aviso en línea y botón deshabilitado mientras la contraseña no cumpla.

## [8.28.0] - 2026-09-21 · minor · feature

Al crear un usuario del personal, el administrador ahora puede escribir una contraseña inicial y el usuario entra de inmediato. Si deja el campo vacío se conserva el comportamiento anterior: contraseña aleatoria y enlace de acceso de un solo uso. La contraseña nunca se muestra en la confirmación y el usuario nuevo queda ligado únicamente a la empresa del administrador.

- src/lib/userAdmin.functions.ts: con contraseña manual no se genera enlace de recuperación y el resultado informa password_set_manually.
- src/features/users/components/users/InviteUserDialog.tsx: campo «Contraseña inicial (opcional)» con mostrar/ocultar y validación de 12-72 caracteres con cuatro clases.
- src/features/users/hooks/users/userAdminMutations/useInviteUser.ts: confirmación diferenciada según se haya definido contraseña o generado enlace.
- src/features/users/hooks/users/__tests__/useInviteUser.test.tsx: regresión de alta con contraseña manual sin exponerla en el aviso.

## [8.27.1] - 2026-09-21 · patch · fix

Cuando el correo de recuperación entregaba el enlace en formato con código, nadie lo canjeaba: no se creaba la sesión temporal y el usuario terminaba en la pantalla de inicio de sesión sin poder escribir su nueva contraseña. Ahora la app detecta ese formato al abrir el enlace, lo canjea una sola vez, limpia la dirección y muestra el formulario; si el enlace es inválido o ya expiró se muestra el aviso para pedir uno nuevo.

- src/features/auth/recoverySession.ts: detectRecoveryCodeFromHref reconoce enlaces ?code= de recuperación, stripRecoveryCodeFromUrl limpia la URL y el arranque en frío marca el flujo como pendiente.
- src/features/auth/recoveryCapture.ts: exchangeRecoveryCodeFromUrl canjea el código una sola vez al arrancar y activa o invalida el flujo según el resultado; nunca registra el código.
- src/features/auth/__tests__/passwordRecoveryCodeLink.test.ts: regresiones de detección, canje exitoso, código inválido y ausencia de llamadas sin código.

## [8.27.0] - 2026-09-21 · minor · feature


Al dar de alta una empresa, el operador de plataforma ahora puede escribir la contraseña inicial del primer administrador. Si la deja vacía, el comportamiento anterior se conserva: el sistema genera una contraseña aleatoria y entrega un enlace de acceso de un solo uso. La contraseña nunca se muestra de vuelta en la confirmación.

- src/lib/platformAdmin.types.ts: CreateOrganizationInput admite admin_password opcional y CreateOrganizationResult expone password_set_manually.
- src/lib/platformAdmin.helpers.ts: validateCreateInput exige entre 8 y 72 caracteres cuando se envía contraseña; createFirstAdminAuthUser acepta la contraseña y mantiene el fallback aleatorio.
- src/lib/platformAdmin.functions.ts: con contraseña manual no se genera enlace de recuperación y se informa password_set_manually.
- src/features/platform/components/PlatformOrganizationDialogs.tsx: campo «Contraseña inicial (opcional)» con mostrar/ocultar y confirmación diferenciada según el camino elegido.

## [8.26.9] - 2026-09-21 · patch · security


Se añade un verificador manual de sólo lectura para una copia ya restaurada en una instancia aislada. Bloquea el proyecto productivo antes de conectar, mide RPO desde el backup hasta el incidente simulado y RTO durante la restauración, consulta integridad y Storage con agregados sanitizados y nunca realiza la restauración. El gate Restore probado permanece pendiente hasta ejecutar un restore real, obtener un run verde y destruir el entorno.

- .github/workflows/restore-rehearsal-verify.yml: workflow_dispatch protegido por environment, confirmación exacta, inputs UTC y secret único; no ejecuta pg_restore ni escribe en la base.
- scripts/restore-rehearsal/: guards fail-closed, transacción READ ONLY, timeouts, ledger, conteos operativos, folios con invoices.issued_at y referencias canónicas de Storage sin depender de columnas inexistentes.
- src/test/restoreRehearsalVerify.test.ts: regresiones para producción bloqueada, RPO/RTO, columnas reales, buckets canónicos, masking y reportes sin datos sensibles.
- docs/multiempresa/gates-segunda-organizacion.md: procedimiento externo, configuración del environment, ejecución manual, revisión de evidencia y destrucción del destino; Restore sigue pendiente.

## [8.26.8] - 2026-09-21 · patch · docs

El ensayo A/B real de datos, Storage y portal contra un Supabase local efímero quedó en verde por primera vez. La corrida 9 probó el commit c4a6b69 y pasó las 16 pruebas de Playwright en 29.6s, con el guard anti-producción activo, bindings locales vía .dev.vars efímero y teardown limpio. Este cambio es sólo documental: marca el gate A/B como verificado y deja restore probado como el siguiente gate externo pendiente. No toca código, RLS, workflows, tests, fixtures, middleware ni guards.

- docs/multiempresa/gates-segunda-organizacion.md: el gate «Ensayo A/B real (datos + Storage + portal)» pasa de Pendiente/ABIERTO a Verificado; se registra la corrida 9 (commit c4a6b69, run 35566123833, job 106228183532, success, 16/16 Playwright), el log «.dev.vars OK», el teardown limpio, el artefacto seguro multitenant-ab-evidence (id 10624198616, digest sha256:26443b6a…), el CI complementario (35566124245) y el Gitleaks (35566123931); se conserva el histórico de corridas 1–8; «Restore probado» sigue PENDIENTE como siguiente gate externo.
- docs/multiempresa/onboarding.md: el gate 1 (Ensayo A/B aislado) pasa de «requiere verificación» a verificado el 2026-09-21 para el commit c4a6b69 con los enlaces y la evidencia de la corrida 9; el gate 2 (Restore probado) sigue pendiente.
- roadmap.md: la línea de gates marca (1) como verificado el 2026-09-21 para c4a6b69 con todos los enlaces y la evidencia, y mantiene (2) restore y los items productivos como pendientes.
- Sin cambios en código, RLS, workflows, tests, fixtures, middleware, guards, Storage real, datos ni producción. Validaciones documentales: changelog:check y lecturas de coherencia.

## [8.26.7] - 2026-09-21 · patch · fix

El ensayo A/B seguía recibiendo «Unauthorized: Invalid token» aunque el navegador y el login ya funcionaban contra el Supabase local. La causa profunda: el servidor del preview se ejecuta con wrangler dev, que lee sus variables de un archivo .dev.vars (o del .env si no existe) y no hereda las variables del proceso. Como el repositorio tiene un .env versionado con la dirección productiva, el servidor validaba las credenciales locales contra la base productiva, como un portero que verifica las credenciales llamando a la oficina equivocada. Ahora el workflow crea un .dev.vars efímero que apunta al Supabase local, lo verifica sin mostrar valores y lo borra al terminar.

- .github/workflows/multi-tenant-ab.yml: nuevo paso que crea .dev.vars con SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY locales y SUPABASE_PROJECT_ID=local-ab-ephemeral (permisos 600, sin imprimir valores); paso de verificación fail-closed que sólo comprueba nombres/presencia, que la URL sea loopback y que no contenga el ref productivo; el teardown elimina .dev.vars con if: always() para que nunca llegue a artifacts.
- .gitignore: se añade .dev.vars* para que el archivo efímero nunca se versione.
- docs/multiempresa/gates-segunda-organizacion.md: se registra la corrida 8 (run 35565322198) y su causa demostrada (bindings de Wrangler hacia producción por el .env versionado). El gate A/B sigue ABIERTO hasta un run completo en verde.
- Sin cambios en RLS, middleware, guards, fixtures ni asertos Playwright; se conserva el bloqueo explícito del ref productivo.

## [8.26.6] - 2026-09-21 · patch · fix

Dos piezas quedaron desalineadas tras la corrección anterior. La prueba que simula el servicio de autenticación no incluía la nueva vía de verificación remota, como un simulacro al que le falta una puerta, y fallaba aunque el comportamiento real era correcto; ahora la incluye y el caso inválido hace fallar ambas vías. Además, la alarma del ensayo A/B no escuchaba cambios en los archivos del camino de autenticación y contexto; ahora sí los vigila para que ningún ajuste ahí eluda la revisión.

- src/lib/__tests__/serverFnTransport.test.ts: el mock compartido de Supabase incluye auth.getUser; el caso de credenciales inválidas hace fallar getClaims y getUser; nueva prueba que cubre el fallback (getClaims falla, getUser valida y el negocio corre con el userId del usuario remoto). Sin cambios en el middleware.
- .github/workflows/multi-tenant-ab.yml: los filtros paths de pull_request y push añaden src/integrations/supabase/auth-middleware.ts, src/lib/authAttacher.ts, src/lib/organizationContext.functions.ts, src/contexts/OrganizationContext.tsx y src/layouts/AuthGuard.tsx, para que cambios del camino de autenticación/contexto disparen el gate. Sin patrones amplios.
- Validaciones: Vitest requireSupabaseAuth + serverFnTransport 12/12, tsgo --noEmit, ESLint del test y actionlint del workflow, todo en verde. El gate A/B sigue ABIERTO hasta un run completo en verde.

## [8.26.5] - 2026-09-21 · patch · fix

El portero que revisa la credencial en cada llamada al servidor sólo usaba una verificación local de firma; con los JWT HS256 que emite el Supabase local del ensayo esa vía fallaba y la sesión se marcaba como expirada aunque el token era válido, como un guardia que sólo acepta una forma de identificación. Ahora, si la vía local no entrega datos, la misma credencial se valida a distancia contra el servicio de autenticación; si ambas fallan, el acceso sigue bloqueado.

- src/integrations/supabase/auth-middleware.ts: getClaims(token) sigue siendo la vía principal; si no entrega claims válidos se valida el mismo token con supabase.auth.getUser(token) y se acepta sólo si devuelve un usuario con id, con claims mínimos {sub}; si ambos fallan se conserva fail-closed con "Unauthorized: Invalid token". Sin decodificar el JWT, sin service role y sin relajar RLS.
- src/lib/__tests__/requireSupabaseAuth.test.ts: pruebas para getClaims exitoso, fallback getUser exitoso, ambos métodos fallando y fallback con usuario sin id.
- docs/multiempresa/gates-segunda-organizacion.md: se registra la corrida 7 (run 35561856480) y su causa demostrada por el artefacto. El gate A/B sigue ABIERTO hasta un run completo en verde.

## [8.26.4] - 2026-09-21 · patch · fix

El ensayo creaba la factura de prueba sin partidas. El trigger de la base exige que toda factura fuera de borrador tenga al menos una partida cuyo importe cuadre con el subtotal, como un recibo que no puede quedar en blanco. Ahora la factura se crea con una partida sintética de importe igual al subtotal y se comprueba por API que quedó emitida, en la empresa correcta y con esa partida antes de seguir.

- tests/multi-tenant-ab/fixtures/abSeed.ts: el INSERT de invoices incluye line_items con una partida canónica (quantity 1, unit_price = total = subtotal), tax_rate 0 y tax_amount 0, sin relajar validate_invoice_line_items_signs.
- tests/multi-tenant-ab/fixtures/abSeed.ts: nueva verificación por API admin tras insertar la factura — status sent, organization_id correcta y exactamente una partida cuyo total coincide con el subtotal; si no, el seed aborta.
- Sin cambios en la lógica de organizaciones, suspensión/restauración por RPC, upsert de roles, guards fail-closed, aislamiento A/B, RLS, Storage, contextos de navegador, teardown if: always(), artifacts v7 ni bloqueo del ref productivo. El gate A/B sigue ABIERTO hasta un run completo en verde.

## [8.26.3] - 2026-09-21 · patch · fix

Al crear un usuario de prueba, el sistema le asigna automáticamente un rol. El ensayo intentaba asignárselo otra vez, como registrar dos veces el mismo puesto de trabajo, y la base lo rechazaba por duplicado. Ahora el ensayo actualiza el rol existente en vez de insertar otro, y comprueba que el interno quede como admin y el del portal como cliente.

- tests/multi-tenant-ab/fixtures/abSeed.ts: el rol del usuario interno se fija con upsert por user_id (mismo patrón que las suites SQL y las funciones de invitación), sin borrar la fila creada por el trigger ni deshabilitarlo.
- tests/multi-tenant-ab/fixtures/abSeed.ts: el rol del usuario del portal se fija con el mismo upsert por user_id, nunca con un segundo INSERT.
- tests/multi-tenant-ab/fixtures/abSeed.ts: nueva verificación por API admin antes de seguir — interno=admin y portal=customer en cada empresa; si no, el seed aborta.
- Sin cambios en la lógica de organizaciones que ya pasó, guards, RLS, migraciones, producto ni datos reales. Se conservan destrucción con if: always(), contextos de navegador por empresa y upload-artifact@v7. El gate A/B sigue ABIERTO hasta un run completo en verde.

## [8.26.2] - 2026-09-21 · patch · fix

La copia temporal del sistema ya nace con una empresa creada por las migraciones. Al agregar la empresa A quedaban dos activas y el alta del cliente fallaba por no saber a cuál pertenecía. Ahora el ensayo apaga primero esa empresa inicial por la vía oficial, siembra A y B, y al terminar la vuelve a encender.

- tests/multi-tenant-ab/fixtures/abSeed.ts: el operador de plataforma sintético se crea antes que cualquier empresa; se consultan por API admin las empresas activas preexistentes, se guardan sus IDs en el contexto y se suspenden con la RPC oficial platform_set_organization_active.
- tests/multi-tenant-ab/fixtures/abSeed.ts: se verifica que no quede ninguna empresa activa antes de sembrar, y antes de guardar el contexto se exige exactamente A y B activas y ninguna empresa inicial activa.
- tests/multi-tenant-ab/global.teardown.ts: tras borrar A/B se restauran las empresas iniciales con la misma RPC oficial y sólo después se elimina el operador sintético; en CI supabase stop sigue siendo la red final.
- Se conservan los contextos de navegador por empresa en la prueba del logo y actions/upload-artifact@v7; el workflow sigue destruyendo Supabase con if: always() aunque el seed falle.
- Sin UPDATE directo sobre organizations, sin deshabilitar triggers y sin cambios de migraciones, políticas, producto, secretos, branding, datos reales ni producción. El gate A/B sigue ABIERTO hasta un run completo en verde.

## [8.26.1] - 2026-09-20 · patch · fix

El ensayo fallaba al dar de alta al cliente de la segunda empresa, como intentar registrar una carpeta sin decir a qué sucursal pertenece. Ahora la segunda empresa se prepara apagada, se enciende al final por la vía oficial y se comprueba que ambas quedaron activas antes de empezar las pruebas.

- tests/multi-tenant-ab/fixtures/abSeed.ts: la empresa B se crea suspendida y se siembra completa mientras sólo A está activa; el cliente declara su empresa dueña (created_by_organization_id) y la relación comercial se hace con upsert para no chocar con el alta automática.
- tests/multi-tenant-ab/fixtures/abSeed.ts: se da de alta un operador de plataforma sintético y B se activa con la RPC oficial platform_set_organization_active; antes de guardar el contexto se verifica por API admin que A y B estén activas.
- tests/multi-tenant-ab/global.teardown.ts: la limpieza elimina también al operador sintético del ensayo.
- tests/multi-tenant-ab/portal-isolation.spec.ts: la prueba del logo global usa un contexto de navegador por empresa, porque limpiar cookies no borra la sesión guardada en el navegador; los asertos no cambian.
- .github/workflows/multi-tenant-ab.yml: actions/upload-artifact pasa de v5 a v7 para eliminar el aviso de Node 20.
- No se debilitó ningún guard, RLS, productionGuard ni localBackend; sin cambios de migraciones, políticas, producto, datos reales, secretos ni producción. El gate A/B sigue ABIERTO hasta tener un run completo en verde.

## [8.26.0] - 2026-09-20 · minor · chore

Se agrega una prueba que crea dos empresas de mentira en una copia temporal del sistema y comprueba que ninguna ve facturas, documentos, archivos ni pantallas de la otra. Nunca toca la información real.

- tests/multi-tenant-ab/: nueva suite del gate A/B con guard fail-closed (localBackend.ts), identidades sintéticas deterministas, seed y limpieza del entorno efímero.
- tests/multi-tenant-ab/data-isolation.spec.ts y storage-isolation.spec.ts: aislamiento por API real (PostgREST y Storage) de lecturas, escrituras, listados, descargas, URL firmadas y objetos legados sin prefijo de empresa.
- tests/multi-tenant-ab/portal-isolation.spec.ts: portal A/B en navegador; cada cliente sólo ve lo suyo, un id ajeno no revela monto ni nombre y ambos portales muestran el mismo logo global LiftGo.
- playwright.multitenant.config.ts, script test:multitenant-ab y abMatrixReporter.ts: configuración separada de las E2E históricas y matriz de evidencia sin tokens, credenciales ni identificadores reales.
- .github/workflows/multi-tenant-ab.yml: Supabase local efímero (Postgres, gotrue, kong, postgrest, storage-api) con el mismo carril de migraciones que RLS DB tests, sin leer secrets y con destrucción del entorno en if: always().
- src/test/multiTenantAbGuard.test.ts: regresión offline que confirma que la suite aborta ante hosts remotos, el ref productivo, la falta de entorno aislado o un escape remoto declarado.
- supabase/tests/rls/README.md: se corrigen los disparadores, el carácter bloqueante de los smoke SQL y la publicación de JUnit; docs/multiempresa/gates-segunda-organizacion.md registra el gate A/B como implementado y pendiente de primera corrida.
- No se cambiaron migraciones, RLS, datos, Storage real, secretos, branding ni producción. El gate A/B sigue abierto hasta tener un run verde verificable.

## [8.25.25] - 2026-09-20 · patch · chore

La suite de pruebas del CI se divide en cuatro partes que corren al mismo tiempo, y al final se juntan los resultados para medir la cobertura completa igual que antes.

- .github/workflows/ci.yml: la matriz del job tests pasa de shard [1, 2] a [1, 2, 3, 4]; nombres, comentarios y el comando usan ahora --shard=N/4. Se conservan fail-fast: false, VITEST_SHARD_BLOB=1 y --coverage en cada shard.
- .github/workflows/ci.yml: tests-merge descarga explicitamente vitest-blob-1, vitest-blob-2, vitest-blob-3 y vitest-blob-4 en .vitest-reports/ antes del merge; si falta cualquier artifact el job falla igual que antes y los umbrales de cobertura no cambian.
- docs/ci.md: la tabla de jobs y la seccion de sharding describen cuatro shards; se aclara que el paralelismo interno de Vitest dentro de cada runner no se modifica.
- actionlint sobre ci.yml: sin errores. No se cambiaron codigo de producto, tests, migraciones, RLS, datos, Storage, secretos ni produccion.

## [8.25.24] - 2026-09-20 · patch · chore

Las pruebas de permisos ya no encienden el intermediario de red ni la interfaz de datos, porque ese trabajo solo consulta la base directamente. Se conserva la autenticación y se agrega una comprobación temprana que detiene el proceso si esa parte no quedó lista.

- .github/workflows/rls-db-tests.yml: supabase start ahora excluye tambien kong y postgrest; se conservan postgres y gotrue, y el comentario describe con precision que se levanta DB + auth sin gateway ni PostgREST.
- .github/workflows/rls-db-tests.yml: nuevo paso previo al db reset que falla si no existen auth.users y auth.uid(); el paso de arranque ahora mide e imprime su duracion en el log y en el resumen del run para comparar contra la referencia (run 35543605857: ~3m20s de arranque, 4m55s de job).
- docs/ci.md: nueva seccion Servicios levantados con el alcance real, el gate de auth y el criterio de revertir la exclusion si rompe el arranque o no aporta mejora material.
- Se conservan todas las suites RLS, los smoke SQL, el db reset y el carril Drizzle; sin paralelizar. actionlint sin errores. No se cambiaron migraciones, RLS, datos, Storage, secretos ni produccion.

## [8.25.23] - 2026-09-20 · patch · chore

El flujo que levanta una base completa para probar los permisos se disparaba con cualquier cambio en la carpeta de Supabase, aunque fuera solo una función que no toca la base. Ahora solo se dispara cuando cambian migraciones, SQL, configuración o scripts de base; las funciones ya se validan aparte con Deno y el CI principal.

- .github/workflows/rls-db-tests.yml: el filtro supabase/** se reemplaza por supabase/migrations/**, supabase/tests/** y supabase/config.toml; se añaden drizzle/migrations/** y scripts/check-drizzle-journal.ts; push a main, pull_request a main y workflow_dispatch se conservan, igual que la concurrencia y los permisos.
- docs/ci.md: nueva sección que explica la separación: cambios de supabase/functions/** se validan con deno-functions (deno fmt/lint y tests unitarios offline) y el CI principal (lint/typecheck/build/smoke); cambios de migraciones, SQL, configuración o scripts de base disparan RLS DB tests; ninguna suite se reduce cuando el workflow sí corre.
- actionlint sobre el workflow resultante: sin errores.
- No se cambiaron migraciones, código de aplicación, RLS, datos, Storage, secretos ni publicación.

## [8.25.22] - 2026-09-20 · patch · docs

Se dejó por escrito, con fecha y enlaces, que la revisión automática completa del sistema quedó en verde para el cambio 44dacee. También se agregó una guía reproducible y sin riesgo para los dos requisitos que siguen abiertos: el ensayo con dos empresas de prueba y el ensayo de recuperación de respaldo. Sólo se tocó documentación: no se ejecutó nada en la base real, ni en archivos, permisos, datos o publicación.

- docs/multiempresa/onboarding.md: nueva sección con la evidencia externa fechada del 2026-09-20 y los tres enlaces de corridas; el requisito de revisión automática queda verificado para ese cambio y cualquier cambio posterior necesita su propia corrida.
- El ensayo con dos empresas de prueba (datos, archivos y portal) y el ensayo de recuperación de respaldo siguen marcados como pendientes por falta de evidencia externa.
- No se marcan como realizados: cambios de base 0030–0035 en producción, operador raíz, conteo de empresas, traslado o borrado de archivos históricos, ni el alta de una segunda empresa.
- Nuevo docs/multiempresa/gates-segunda-organizacion.md: precondiciones y bloqueo contra producción, procedimiento del ensayo con dos empresas ficticias en base desechable, procedimiento de recuperación de respaldo aislada con medición de pérdida máxima y tiempo de recuperación, evidencia a guardar y lista de aprobación sin credenciales ni identificadores reales.
- roadmap.md: la línea de requisitos distingue lo verificado de lo pendiente y remite a la nueva guía; se conservan los registros históricos con su fecha.
- Sin cambios de código de negocio, esquema, permisos, archivos reales, datos, secretos, logo global ni publicación.

## [8.25.21] - 2026-09-20 · patch · security

Endurecimiento multiempresa (P1) de los dos endpoints heredados que seguían invocables con service_role. Sin cambios de esquema, RLS, Storage real, datos ni publicación.

- `supabase/functions/classify-feedback-report/`: handler con dependencias inyectadas; empresa resuelta desde `organization_memberships` antes de consultar AI y filtro `organization_id` en lectura y actualización de `feedback_reports`.
- `supabase/functions/validate-supplier-rep/`: empresa resuelta antes de leer el pago; filtros `organization_id` en `supplier_payments`, `supplier_bills`, comprobación de UUID duplicado y actualización; `activity_feed` con empresa explícita; rutas de Storage derivadas de `bill.organization_id`.
- Ambos ignoran cualquier `organization_id` del cuerpo y fallan cerrado (403 sin membresía, 503 ante error de lectura).
- Pruebas offline de aislamiento (`orgIsolation_test.ts`) en ambas funciones; smoke tests existentes conservados.
- `docs/functions-inventory.md`: clasificación de cada endpoint activo (tenant-scoped, cron/service_role, global explícito, retirado) y razón de las funciones globales.
- Los endpoints se conservan por compatibilidad; las rutas preferidas son `src/lib/feedbackAi.functions.ts` y `src/lib/supplierRep.functions.ts`.

## [8.25.20] - 2026-09-20 · patch · chore

Verificador reutilizable del journal de migraciones Drizzle y política de migraciones documentada. Sin cambios de esquema, datos ni lógica de la aplicación.

- `scripts/check-drizzle-journal.ts`: correspondencia 1:1 SQL/journal, `idx` continuo desde 0, `when` entero y estrictamente creciente, sin duplicados; exit distinto de cero con mensajes accionables.
- `package.json`: nuevo script `migrations:check`.
- `.github/workflows/rls-db-tests.yml`: reemplaza el bloque Python inline por `bun run migrations:check`, manteniendo el orden del workflow.
- `docs/migrations.md`: carril legado vs. carril vigente, orden de CI, canal oficial en producción, ledger id 31 y límite de certeza documental; enlazado desde `README.md`.
- Pruebas unitarias del verificador sin dependencia de base de datos.

## [8.25.19] - 2026-09-19 · patch · refactor

Separación estructural de la carga de estados de cuenta bancarios. Sin cambios de comportamiento, límites, mensajes, parsers, payload de importación ni contratos.

- `src/features/bank-reconciliation/hooks/useStatementUpload.ts`: orquestador de estado y ciclo de vida con la misma API pública.
- `statementUpload/limits.ts`, `analysis.ts`, `analyzedUpload.ts`, `mappingStorage.ts`, `feedback.ts` y `useAnalysisRun.ts`: límites, formato/parseo, identidad del análisis, localStorage del mapeo, mensajes es-MX y tokens de cancelación.
- Se retiraron las directivas `eslint-disable` de `max-lines-per-function` y `complexity` sin añadir otras supresiones.
- Pruebas unitarias nuevas para los helpers; las pruebas existentes se conservan.
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, branding, CI, dependencias ni publicación.

## [8.25.18] - 2026-09-19 · patch · refactor

Separación estructural de la pantalla de pago de facturas del portal. Sin cambios de comportamiento, consultas, saldo, bloqueos, navegación, textos, clases, accesibilidad ni contratos.

- `src/features/portal/pages/PortalInvoicePayment.tsx`: queda como orquestador de ruta, consultas, reintento conjunto, carga/error/no encontrado y `dlgOpen`.
- `src/features/portal/pages/PortalInvoicePaymentParts.tsx`: piezas visuales y composición del pago con el mismo DOM, textos es-MX, clases, accesibilidad y props.
- `src/features/portal/pages/PortalInvoicePayment.helpers.ts`: cálculo puro de saldo, reportes pendientes y regla MXN/SPEI sin cambios.
- Pruebas puntuales para contrato, saldo canónico y calculado, notas de crédito, reportes pendientes y moneda predeterminada.
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, branding, configuración de CI, dependencias ni publicación.

## [8.25.17] - 2026-09-19 · patch · fix

Corrección del fallo de CI del Paquete 14. Sin cambios en `AuthPage.tsx`, `AuthPageParts.tsx`, lógica de autenticación, recuperación, navegación, textos, clases, accesibilidad ni APIs.

- Causa raíz: `src/components/branding/__tests__/AuthBrandPanel.test.tsx` exigía `BrandLockup` en el código fuente de `AuthPage.tsx`; tras extraer las piezas presentacionales (8.25.16), el lockup vive en `AuthPageParts.tsx` y la aserción fallaba en el shard 2 de CI.
- Fix mínimo: el callsite del lockup en `GLOBAL_BRAND_CALLSITES` pasa de `AuthPage.tsx` a `AuthPageParts.tsx`; `AuthPage.tsx` permanece en `LOGIN_SCREENS` con la verificación contra `logo_url`/`usePublicBranding`. No se eliminaron ni debilitaron aserciones.
- Validación: `passwordRecovery.test.tsx` (14/14), shard 2 completo (191 archivos, 1288/1288 pruebas), ESLint, `tsgo --noEmit`, `arch:check` y build en verde.
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, rutas, tipos generados, UI, branding, logo ni CI.

## [8.25.16] - 2026-09-19 · patch · refactor

Separación de responsabilidades en la pantalla de acceso. Sin cambios de UI, textos es-MX, clases, iconos, aria/role, orden del DOM, accesibilidad, marca global LiftGo, avisos de recuperación, enlaces secundarios, llamadas a signIn/resetPassword/updatePassword/signOut, notificaciones, dismissAuthError, sincronización de prevRecovery ni navegación.

- `src/features/auth/pages/AuthPageParts.tsx`: `TITLES`, `RecoveryNotice` (pending/error, botón «Solicitar un enlace nuevo», `role alert`), `AuthCardHeader` (`BrandLockup`, `GLOBAL_BRAND_NAME`, ruta desconocida) y `AuthModeLinks` (olvidé contraseña, volver, cancelar recuperación) con sus tipos/props, marcado idéntico.
- `src/features/auth/pages/AuthPage.tsx`: orquestador (310→191 líneas) con `useAuth`, `useLocation`, `useNavigateTransition`, `useRecoveryStatus`, estados, `getRecoveryUserId`, `endRecovery`, `recoverySessionMatches`/`canSubmitReset`, `leaveAuthRoute`, `finishRecovery`, `cancelRecovery`, `runSubmit`, `handleSubmit`, formulario y navegación al portal.
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, `AuthContext`, hooks, `recoverySession`, rutas, tipos generados, branding, logo ni CI.

## [8.25.15] - 2026-09-19 · patch · refactor

Separación de contratos y fetchers del módulo Auditoría. Sin cambios de nombres, firmas, tipos, `staleTime` (60_000), selects PostgREST, límites, ordenamientos, filtros, RPC, mensajes ni aislamiento.

- `src/features/audit/lib/auditQueryContracts.ts`: `auditKeys`, tipos (`AuditLog`, `AuditSource`, `AuditOrigin`, `AuditLogFilters`, `LabelProjectionRow`), `readAuditLogFilters` (origin por defecto `default`), `buildLabel` (`ROLE_LABELS`, truncado a 30, fallback `recordId.slice(0, 8)`) y `normalizeJson`.
- `src/features/audit/lib/auditLogQueries.ts`: `auditLogsQueries` y `auditLogDetailQueries` con los mismos selects, `LIST_FETCH_LIMIT`, orden, filtros de origen, join de `profiles`, `.eq("id", id).maybeSingle()` y normalización de `old_data`/`new_data`.
- `src/features/audit/lib/activityMetricsQueries.ts`: `ActivityMetricsRpcPayload`, `parseRangeDate`, `readActivityRange` y `activityMetricsQueries` con `callRpc("get_activity_metrics", ...)`, fallback a "ahora" y cálculo de `uniqueActors`/`peakHour`/`topModule`.
- `src/features/audit/lib/queryKeys.ts`: fachada (325→~24 líneas) que reexporta la API pública; mismo path para consumidores y tests.
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, tipos generados, rutas, UI, branding, logo ni CI.

## [8.25.14] - 2026-09-19 · patch · refactor

Separación de responsabilidades en el catálogo de bloqueos de negocio. Sin cambios de códigos, mensajes es-MX, `action`/`reason`/`nextStep`, tonos, patrones regex, orden, fallback, type narrowing, imports de consumidores ni rutas públicas.

- `src/lib/rules/businessBlocks.data.ts`: datos estáticos del catálogo (`BusinessBlockCode`, `BusinessBlock`, `BusinessBlockTone`, `BlockCopy`, `BUSINESS_BLOCKS`, `ERROR_PATTERNS`, `CONSTRAINT_BLOCKS` y `FORKLIFT_TARGET_ACTIONS`), sin lógica.
- `src/lib/rules/businessBlocks.ts`: fachada pública (319→~50 líneas) con `describeBusinessBlock`, `businessBlockSummary`, `resolveBusinessBlock` y `describeForkliftRentalBlock`; reexporta `BusinessBlockCode`, `BusinessBlock` y `BUSINESS_BLOCKS`.
- Precedencia intacta en `resolveBusinessBlock`: restricción nombrada vía `CONSTRAINT_BLOCKS`, patrones de `ERROR_PATTERNS` y fallback `null`.
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, query keys, tipos generados, rutas, UI, branding, logo ni CI.

## [8.25.13] - 2026-09-19 · patch · refactor

Separación de responsabilidades en la vista de previsualización de facturación recurrente. Sin cambios de UI, textos es-MX, clases Tailwind, iconos, aria-labels, navegación a `/invoices/{existingInvoiceId}`, `stopPropagation`, fallback de número, `recurringLineKey`, keys de fila `bookingId:periodStart`, formato monetario, IVA incluido, prorrateo, avisos de tarifa modificada, reglas de `isSelectable`, selección de grupos, skeletons, `EmptyState`, altura/overflow ni comentarios de dominio.

- `src/features/invoices/components/recurring/RecurringPreviewBody.tsx`: orquestador (315→103 líneas) con estados loading/empty, cálculo de `alreadyInvoicedCount`, `isSelectable` y composición de las piezas extraídas; conserva el export público `RecurringPreviewBody` y la interfaz de props.
- `src/features/invoices/components/recurring/RecurringPreviewParts.tsx`: `REASON_LABEL`, `SummaryBar`, `IneligibleBadge`, `AlreadyInvoicedNotice`, `StaleRateNotice`, `LineRow` y `CustomerGroup` con sus tipos/props, marcado idéntico.
- Sin cambios en consultas, mutaciones, RLS, SQL, migraciones, autenticación, storage, rutas, tipos generados, branding, logo ni CI.

## [8.25.12] - 2026-09-19 · patch · refactor

Separación de responsabilidades en la tarjeta de notas de crédito del detalle de factura. Sin cambios de UI, textos es-MX, clases, iconos, aria-labels, estados disabled/pending, orden de columnas, formatos de fecha/monto, confirmación destructiva ni reglas de `canCreate`/bloqueo por tipo de cambio o complementos.

- src/features/invoices/components/invoice-detail/InvoiceCreditNotesCard.tsx: orquestador (276→105 líneas) con queries (`useCreditNotesForInvoice`, `usePayments`), estados, mutaciones, `useConfirm`, `computeCreditNoteLimits`, `canCreate`, early return y diálogos.
- src/features/invoices/components/invoice-detail/InvoiceCreditNotesParts.tsx: `CnBadge`, `CreditNoteNotices`, `CreditNoteActions` y `CreditNotesTable` con sus tipos/props, marcado idéntico.
- src/features/invoices/components/invoice-detail/downloadCreditNote.ts: descarga CFDI con la misma llamada a `downloadCfdiBlob`, nombres de archivo y `notifyError`.
- Sin cambios en hooks de credit notes, `computeCreditNoteLimits`, diálogos existentes, SQL, RLS, migraciones, Storage, autenticación, tipos generados, rutas, funciones CFDI, CI ni publicación.

## [8.25.11] - 2026-09-19 · patch · refactor

Separación de responsabilidades en la página de calendario. Sin cambios de UI, textos, clases, accesibilidad, estados de carga/error, navegación mes/semana, refresh, query keys, `refetchQueries`, comportamiento mobile, SQL, RLS, migraciones, Storage, autenticación ni publicación.

- src/features/calendar/pages/CalendarPage.tsx: orquestador (290→161 líneas) con estado, queries (`useBookingsRange`, `useForkliftMap`), navegación y composición; las llamadas y la fuente de organización no cambian.
- src/features/calendar/components/calendar/CalendarPageParts.tsx: piezas visuales `EndingSoonAlert`, `CalendarToolbar` y `CalendarLoadingSkeleton` con sus tipos/props, idénticas en UI y accesibilidad.
- src/features/calendar/hooks/useMaintenanceWindows.ts: hook extraído con la misma consulta `useMaintenanceLogs`, `useMemo`, fechas, etiquetas, ids generados y el tipo `MaintenanceWindow` de `GanttCard`.
- src/features/calendar/hooks/__tests__/useMaintenanceWindows.test.tsx: contrato del hook (lista vacía, franjas de próximo servicio y OT abierta con ids/etiquetas intactos, OT completada sin franja). Se conserva `useGanttSegments.test.tsx`.
- Sin cambios en Gantt/EquipmentListView/CalendarStatCards, tipos generados, `routeTree.gen.ts` ni CI.

## [8.25.10] - 2026-09-19 · patch · refactor


Separación del catálogo de errores de Postgres entre datos estáticos y lógica de resolución. Sin cambios de comportamiento, mensajes es-MX, precedencia, SQL, RLS, migraciones, Storage, autenticación, query keys, UI ni publicación.

- src/lib/errors/pgErrorCatalog.data.ts: datos estáticos del catálogo (`CONSTRAINT_MESSAGES`, `SQLSTATE_MESSAGES`, `WARNING_SQLSTATES`, `PRIORITY_TEXT_PATTERNS`, `TEXT_PATTERNS`) y tipos internos `ErrorSeverity`/`CatalogEntry`, sin algoritmo.
- src/lib/errors/pgErrorCatalog.ts: fachada pública (336→~130 líneas) con `PgErrorTranslation`, resolución (`haystack`, `findConstraint`, `findSqlstate`, `findTextEntry`, `build`, `translatePgError`) y reexportación de `CONSTRAINT_MESSAGES`/`SQLSTATE_MESSAGES`; consumidores como `useSuppliers.ts` no cambian.
- Precedencia intacta: constraint nombrada → patrones prioritarios → SQLSTATE/P0001 → patrones de texto → fallback; mismos mensajes, severidades, `matched`, `constraint`, `sqlstate` y manejo de `extractErrorDetails`.
- src/lib/errors/__tests__/pgErrorCatalog.facade.test.ts: contrato de la fachada (exportaciones, identidad de mapas reexportados, casos de constraint, patrón prioritario, SQLSTATE y fallback). Se conservan sin cambios `pgErrorCatalog.test.ts`, `sharedCatalogConflicts.test.ts` y `orgScopedCatalogConflicts.test.ts`.

## [8.25.9] - 2026-09-19 · patch · refactor


Separación de lecturas y mutaciones en el módulo de clientes. Sin cambios de comportamiento, SQL, RLS, migraciones, Storage, autenticación, query keys ni publicación.

- src/features/customers/hooks/customers/useCustomers.ts: fachada de compatibilidad (203→24 líneas) que conserva `Customer`, `CustomerPortalAccountStatus`, `CustomerPortalAccountSummary`, `customerQueries`, `useCustomers`, `useCustomer`, `useCustomerPortalAccount`, `useCreateCustomer`, `useUpdateCustomer` y `useDeleteCustomer`.
- src/features/customers/hooks/customers/customerQueries.ts: lecturas idénticas sobre `organization_customers` (`status = 'active'`) con `customers!inner`, filtros de archivado/E2E, `LIST_FETCH_LIMIT`, detalle por id y cuenta de portal por empresa. El navegador nunca envía `organization_id`.
- src/features/customers/hooks/customers/customerMutations.ts: alta, actualización con `expectedVersion`/`stale_write`, `assertRowsAffected`, RPC `soft_delete_customer`, invalidaciones, títulos de error y `onBusinessBlock` sin cambios.
- src/features/customers/hooks/customers/__tests__/useCustomersFacade.test.ts: contrato de exportaciones, lectura por relación comercial y `expectedVersion` en el filtro de actualización. Se conserva `useCustomers.rls.test.ts`.

## [8.25.8] - 2026-09-19 · patch · refactor

Separación del prellenado de cotizaciones entre lógica pura y hook. Sin cambios de comportamiento, reglas de negocio, compatibilidad legacy, SQL, RLS, migraciones, Storage, autenticación ni publicación.

- src/features/quotes/hooks/quoteForm/useQuotePrefill.ts: fachada/hook (294→63 líneas) que reexporta exactamente la API previa (`buildPrefillValues`, `quoteRentalDays`, `rentalRateField`, tipos `EquipmentModel` y `ExistingQuote`) y conserva `useQuotePrefillValues` con la misma firma y cacheo por id basado en `useState`.
- src/features/quotes/hooks/quoteForm/quotePrefill.logic.ts: funciones puras y tipos de prellenado, idénticas reglas (rate_type explícito, heurísticas diaria/semanal/mensual, `legacyQty`, `rental_meta`, `legacyTotal`/`legacyDescription`, deduplicación por descripción, logística/seguro, defaults de descuentos y fechas inclusivas).
- src/features/quotes/hooks/quoteForm/__tests__/useQuotePrefill.facade.test.ts: contrato de reexportaciones y resultados legacy representativos. Se conservan las cinco pruebas existentes.
- Sin `useEffect`, `useMemo` ni timers nuevos; sin ciclos de importación.

## [8.25.7] - 2026-09-19 · patch · refactor

Separación de consultas, tipos y fachada en el portal de clientes. Sin cambios de comportamiento, query keys, `staleTime`, `enabled`, columnas explícitas, RPC, paginación, mapeo de montacargas, SQL, RLS, migraciones, Storage, autenticación ni publicación.

- src/features/customers/hooks/customers/useCustomerPortal.ts: fachada de compatibilidad (327→26 líneas) que conserva la API y las rutas de importación previas (`usePortalCustomer`, `usePortalBookings`, `usePortalBookingsPage`, `usePortalInvoices`, `usePortalInvoice`, `usePortalInvoicesPage`, `usePortalContracts`, `usePortalContractsPage`, `usePortalPayments`, `usePortalInvoicePayments`, `PortalPaymentRow`, `PortalCustomerRow`, `PortalPage`, `PortalInvoiceRow`, `PortalContractRow`, `PortalBookingRow`).
- src/features/customers/hooks/customers/customerPortalQueries.ts (246 líneas): los diez hooks del portal; `usePortalScope` unifica `useAuth` + `useVerifiedIdentityScope` sin alterar claves ni activación.
- src/features/customers/hooks/customers/customerPortal.helpers.ts: constantes de columnas, `pageBounds`, `parseRpcPage` y `fetchForkliftsBriefMap`, idénticos.
- src/features/customers/hooks/customers/customerPortal.types.ts: tipos compartidos del portal, sin tocar los tipos generados.
- La organización verificada sigue formando parte de `portalKeys.*` y de `enabled`; `useVerifiedPortalCustomerId` se mantiene como única fuente de identidad del cliente.
- src/features/customers/hooks/customers/__tests__/useCustomerPortalFacade.test.tsx: contrato de exports, uso del cliente verificado y scope de organización, y no-consulta sin scope. `usePortalCustomer.test.tsx` se conserva sin cambios.

## [8.25.6] - 2026-09-19 · patch · refactor

Separación de consultas y mutaciones en el módulo de facturas. Sin cambios de comportamiento, reglas de negocio, filtros, query keys, invalidaciones, mensajes, RPC, RLS, UI, base de datos, datos, Storage, secretos ni publicación.

- src/features/invoices/hooks/invoices/useInvoices.ts: fachada de compatibilidad (317→24 líneas) que reexporta exactamente la API previa (`INVOICE_PAGE_SIZE`, `fetchInvoicesForExport`, `invoiceQueries`, `useInvoices`, `useInvoice`, `useInvoicesInfinite`, `useCreateInvoice`, `SaveInvoiceWithBookingsArgs`, `useSaveInvoiceWithBookings`, `useUpdateInvoice`, `useDeleteInvoice`).
- src/features/invoices/hooks/invoices/invoiceQueries.ts: `INVOICE_STALE_MS`, `INVOICE_PAGE_SIZE`, `INVOICE_COLUMNS`/`INVOICE_LIST_COLUMNS`, `baseInvoiceQuery`, `fetchInvoiceList`, `fetchInvoicePage`, `fetchInvoicesForExport`, `fetchInvoiceDetail`, opciones de lista/detalle y hooks de lectura; idénticos filtros de vencidas, `e2eVisibilityFilter`, `todayKeyMty`, límites, orden y paginación.
- src/features/invoices/hooks/invoices/invoiceMutations.ts: `useCreateInvoice`, `SaveInvoiceWithBookingsArgs`, `useSaveInvoiceWithBookings`, `useUpdateInvoice`, `useDeleteInvoice`; mismos RPC (`next_draft_invoice_number`, `save_invoice_with_bookings`), `expectedVersion`/`stale_write`, `assertRowsAffected`, invalidaciones y limpieza de caché. `organization_id` sigue resolviéndose en la base.
- src/features/invoices/hooks/invoices/__tests__/useInvoicesFacade.test.ts: casos nuevos de compatibilidad de la fachada y de separación lectura/escritura.
- Sin ciclos de importación ni dependencias de UI en los módulos nuevos.

## [8.25.5] - 2026-09-19 · patch · refactor

Separación de responsabilidades de los guards administrativos del servidor. Sin cambios de contratos, comportamiento, migraciones, datos, Storage, secretos ni publicación.

- src/lib/server/adminGuards.server.ts: fachada de compatibilidad (309→42 líneas) que reexporta exactamente la API previa (`HttpError`, `AppRole`, `AdminClient`, `CallerClient`, `AuthorizedCaller`, `isUUID`, `isEmail`, `isNonEmptyString`, `isValidRole`, `generateSecurePassword`, `requireRole`, `requireAdmin`, `enforceRateLimit`, `requireInternalOrganization`, `assertTargetInOrganization`, `createInternalMembership`, `asUntypedRpc`, `UntypedRpcClient`, `requirePlatformOperator`).
- src/lib/server/guards/: `httpError.ts` (error y tipos base), `validation.ts`, `password.ts`, `roleAuthorization.server.ts`, `rateLimit.server.ts`, `organizationScope.server.ts` y `platformOperator.server.ts`. Sin ciclos de importación y sin acceso privilegiado en el navegador.
- Comportamiento preservado 1:1: fail-closed con 503/403/404/429, mismos mensajes, mismas llamadas RPC (`is_active_user`, `has_role`, `check_and_record_rate_limit`, `is_platform_operator`), filtros `organization_id` y distinción internal/portal.
- src/lib/server/__tests__/adminGuardsFacade.test.ts: 7 casos nuevos (API exportada y fail-closed de rol, rate limit y empresa).
- Validación local: 31/31 pruebas (adminGuards, requirePlatformOperator, fachada y detector de aislamiento), `eslint src/lib/server` sin avisos, `tsgo --noEmit` y `arch:check` OK. Suite completa pendiente de GitHub Actions.

## [8.25.4] - 2026-09-19 · patch · refactor

Separación de responsabilidades en la validación de REP de proveedor. Sin cambios funcionales, de seguridad multiempresa, base de datos, Storage real, datos, secretos ni publicación.

- src/lib/supplierRep.functions.ts: adaptador server-only delgado (314→110 líneas); conserva `requireRole`, `current_organization_id`, el rate limit 5/60s y los exports públicos (`extractAttr`, `extractAllAttr`, `extractPagoNodes`, `isWellFormedXml`, `ValidateSupplierRepInput`, `validateSupplierRepFn`).
- src/lib/supplierRep.validation.ts: validaciones puras de entrada y XML (`validateRepInput`, `decodeRepXml`, `assertEmisorMatchesSupplier`, `assertPagoMatchesInvoice`, `extractRepUuid`), con guardas inyectadas para poder probarse sin cliente privilegiado.
- src/lib/supplierRep.data.server.ts: `loadPaymentAndBill`, `assertRepUuidNotDuplicated`, `markRepReceived` y `recordRepActivity`; todas las consultas privilegiadas mantienen `.eq("organization_id", organizationId)`.
- src/lib/supplierRep.storage.server.ts: `uploadRepFiles` sobre el bucket `cfdi-files` con `organizationStoragePath`.
- src/lib/__tests__/supplierRepValidation.test.ts: 15 casos nuevos de validaciones puras, incluidos los códigos 400/413 y sus mensajes.
- Validación local: 36/36 pruebas (validación REP, XML, detector de aislamiento y rutas de Storage), `eslint` sin avisos en los archivos tocados, `tsgo --noEmit` y `arch:check` OK. Suite completa pendiente de GitHub Actions.

## [8.25.3] - 2026-09-19 · patch · docs

Reconciliación documental multiempresa y limpieza semántica del branding. Sin cambios de base de datos, migraciones, Storage, publicación ni rediseño visual.

- docs/multiempresa/onboarding.md: el estado vigente se divide en «verificable en el repositorio» y «requiere verificación (evidencia externa)»; migraciones aplicadas, operador raíz, Storage, organizaciones activas, respaldo/restore y CI quedan marcados como no verificables desde el repo.
- Gates antes de habilitar una segunda organización, explícitos: (1) ensayo A/B aislado de datos, Storage y portal, (2) restore probado y documentado, (3) CI completo en verde con enlace al run. Branding sin gate: el logo es global y fijo.
- roadmap.md: se retira «branding por empresa» de los gates y se marca cada gate como pendiente de evidencia fechada.
- src/layouts/CustomerPortalLayout.tsx, src/features/company-settings/hooks/usePublicBranding.ts, src/features/company-settings/lib/queryKeys.ts y src/features/company-settings/pages/CompanySettingsPage.tsx: JSDoc/comentarios actualizados — marca global LiftGo, razón social como identidad legal por organización, sin logo editable por empresa.
- Sin renombres de API ni cambios de contrato: `get_public_branding`, `publicBrandingQueries` y `PublicBrandingRow` intactos. No quedan usos funcionales de `company_settings.logo_url` en `src/` (sólo tipos generados y pruebas de regresión).

## [8.25.1] - 2026-09-18 · patch · fix

Corrección de las observaciones de CI sin cambios funcionales.

- drizzle/migrations: se eliminaron los artefactos redundantes 0036–0041 (copias de 0030–0035 con `when` anterior al baseline, nunca aplicadas según `drizzle.__drizzle_migrations`) y sus entradas/snapshots del journal; ninguna migración aplicada se editó ni se renombró y no hubo escrituras en producción.
- src/test/drizzleJournalOrder.test.ts: baseline real 1790269364000 / idx 35, con pruebas separadas de correspondencia baseline↔idx y de migraciones pendientes; sin debilitar aserciones.
- src/lib/platformAdmin.{types,helpers}.ts y src/lib/customerPortal.{helpers,link}.ts: extracción de tipos y auxiliares (389→222 y 369→107 líneas).
- src/features/platform/components/PlatformOrganizationDialogs.tsx: diálogos y acciones extraídos de la página (412→169 líneas).
- src/lib/__tests__/helpers/orgIsolation{Policy,Scanner}.ts y src/lib/__tests__/retiredEndpoints.test.ts: detector separado en política/escáner/pruebas; `extractChain` baja de complejidad 17 con `lineBreakEndsChain`; allowlist actualizada a las nuevas rutas.
- src/hooks/useDocuments.ts: orden de importaciones.
- Validación local: 16/16 detector+retirados, 134 pruebas puntuales, `drizzle-kit check`, `tsgo --noEmit`, `eslint src` (0 errores) y build. CI completo pendiente del nuevo run.

## [8.25.0] - 2026-09-18 · minor · feature

Branding global: ninguna organización tiene logo propio. El lockup oficial `public/brand/liftgo-montacargas.png` es el único logo del sistema, tanto en la marca del ERP/portal como en todos los documentos generados. Sin cambios de base de datos, Storage, valores productivos ni publicación.

- src/lib/branding/globalBrandLogo.ts: nueva fuente única de rutas de marca global.
- src/lib/pdf/assets/logo.ts: `loadGlobalBrandLogo()` carga el asset local (con caché); se eliminó `loadCompanyLogo`/firma por tenant y el fetch a hosts externos.
- src/lib/pdf/shared.ts y src/lib/branding/resolveIssuerBranding.ts: se quitó `logo_url` de `CompanyData`/`IssuerBranding` y del `select`; se conserva la identidad fiscal por organización.
- src/lib/pdf/contract/*: se retiró `fetchLogoBase64`; el contrato usa el logo global.
- UI: eliminados CompanyLogoTab, LogoUploader, useCompanyLogoSrc, useUploadCompanyLogo, logoSource y la pestaña de logo en Configuración de operaciones; `logo_url` sale de esquemas, formularios, selects y mutaciones (el valor en base no se reescribe).
- Pruebas: nueva `src/lib/pdf/assets/__tests__/globalBrandLogo.test.ts` (A y B con el mismo asset por tipo de documento, `logo_url` ignorado, sin URLs remotas); se retiraron las pruebas de aislamiento de logo por tenant.
- Docs: `docs/multiempresa/onboarding.md`, `docs/multiempresa/storage-historico.md` y `roadmap.md` describen branding global, campo histórico sin uso y sin migración pendiente.

## [8.24.1] - 2026-09-18 · patch · fix

El sidebar expandido y el panel de acceso aplicaban `brightness-0 invert` al lockup oficial, recoloreándolo de blanco. Se eliminaron esos filtros para conservar los colores originales del PNG entregado por el propietario; donde el fondo es oscuro, el lockup va dentro de una tarjeta clara con espacio suficiente, sin recortar ni modificar píxeles. En fondos claros se usa directo. Sin cambios de base de datos, Storage ni publicación.

- src/layouts/sidebar/SidebarBranding.tsx y src/components/branding/AuthBrandPanel.tsx: se quitaron los filtros y se agregó una tarjeta clara (`bg-card`, padding) para contraste sobre fondo oscuro.
- src/components/branding/**tests**/AuthBrandPanel.test.tsx: nueva prueba negativa que impide `brightness-0`/`invert` en cualquier callsite global de marca.
- El archivo fuente sigue siendo `public/brand/liftgo-montacargas.png`, el asset local exacto (11/11 pruebas puntuales).

## [8.24.0] - 2026-09-18 · minor · feature

El logotipo oficial «LIFT GO MONTACARGAS» entregado por el propietario pasa a ser el asset local versionado y fuente única de la marca global del producto, idéntica en todas las empresas. Sustituye al emblema/monograma como marca principal en el sidebar expandido, encabezados del ERP, pantallas de acceso y portal. Sin cambios de base de datos, Storage, valores productivos ni publicación.

- public/brand/liftgo-montacargas.png: asset local versionado; `GLOBAL_BRAND_LOCKUP_SRC` apunta a esa ruta del propio origen.
- src/components/BrandMark.tsx: nuevo `BrandLockup` con `object-contain`, `w-auto` y alturas adaptables (no recorta ni estira el lockup).
- Callsites globales migrados: AuthBrandPanel, AuthPage, PortalLogin, CustomerPortalLayout y SidebarBranding (expandido); el sidebar colapsado conserva `BrandMark` por legibilidad.
- `company_settings.logo_url` sigue reservado al logo empresarial de Configuración/documentos, con aislamiento y fail-closed ya implementados.
- Pruebas: existencia del asset, uso del lockup local en todos los callsites globales, proporción conservada y ausencia de cualquier URL remota (10/10 en Vitest puntual).

## [8.23.7] - 2026-09-18 · patch · fix

Las pantallas de acceso del ERP y del portal seguían consumiendo `usePublicBranding().logo_url` (panel de marca y un `<img>` directo en el encabezado). Ahora toda la marca visible de acceso sale del asset local fijo de LiftGo y del nombre global; `company_settings.logo_url` queda restringido a Configuración y a los documentos fiscales/PDF con resolver aislado por organización. Sin cambios de base de datos, Storage ni publicación.

- src/components/branding/AuthBrandPanel.tsx: se eliminaron los props `logoUrl`/`razonSocial` y la rama de `<img>`; usa `BrandMark` (asset local) y `GLOBAL_BRAND_NAME`.
- src/features/auth/pages/AuthPage.tsx y src/features/portal/pages/PortalLogin.tsx: se retiró `usePublicBranding` y los encabezados con `company.logo_url`; ahora renderizan `BrandMark` + "LiftGo".
- src/components/branding/**tests**/AuthBrandPanel.test.tsx: prueba positiva del asset local, negativa con un `logoUrl` externo inyectado (no se renderiza, cero URLs http) y verificación estática de que las dos pantallas de acceso no contienen `logo_url` ni `usePublicBranding`.
- Rastreo completo de callsites de `logo_url`: sólo permanecen en Configuración (CompanyLogoTab/FiscalDataTab), los esquemas/hooks de company-settings y los documentos PDF (`resolveIssuerBranding`, `pdf/shared`, `pdf/contract`).
- Validación puntual en Lovable: Vitest de marca y panel (5/5), typecheck, lint y build. Suite completa en CI.

## [8.10.6] - 2026-09-17 · patch · docs

La corrida de GitHub Actions sobre el commit correctivo `0a941a4a` (8.10.5) confirmó que todas las suites pasan: RLS 54/54, smoke 45/45, CI principal y Gitleaks en verde. Las dos suites del folio REP que fallaban por el permiso directo de anon ahora pasan. La migración 0026 sigue pendiente de rollout productivo; no se ejecutó SQL contra producción ni se activó una segunda empresa. Solo documentación.

- RLS DB tests run 35234484524: 54/54, 0 fallidas; SQL smoke en el mismo run: 45/45, 0 fallidos. https://github.com/hlopezb83/liftgo/actions/runs/35234484524
- CI principal run 35234484453: éxito (Vitest, calidad lint/tipos/build/arranque, lint de migraciones); Dependency review, Deno y Actionlint omitidos según filtros; advertencia no bloqueante preexistente de orden de imports en src/hooks/useDocuments.ts fuera del diff. https://github.com/hlopezb83/liftgo/actions/runs/35234484453
- Gitleaks run 35234484442: éxito. https://github.com/hlopezb83/liftgo/actions/runs/35234484442
- Se actualizó docs/multiempresa/tramo-8-1-rollout-folio-rep.md con la evidencia final y se marcó cerrada la validación de código en el roadmap.
- La migración 0024→0025→0026 sigue pendiente de rollout productivo (journal en 0023); no se ejecutó SQL contra producción ni se activó una segunda empresa.

## [8.10.5] - 2026-09-17 · patch · security

GitHub Actions detectó que la versión estricta del asignador de folio quedaba ejecutable por el rol anónimo. La causa es real y no un falso positivo: la plataforma concede EXECUTE directamente a anon a toda función nueva del esquema público mediante privilegios por defecto, así que retirar el permiso a PUBLIC no lo quita. La migración pendiente 0026 ahora retira el permiso a anon de forma explícita en ambas firmas, y las pruebas exigen además la lista de permisos directa, no solo la efectiva.

- Causa confirmada en base temporal aislada: ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon concede EXECUTE DIRECTO a anon al crear la función; no es herencia de roles ni de PUBLIC.
- drizzle/migrations/0026_rep_number_org_scoped_assignment.sql: se añade REVOKE ALL ... FROM anon a la firma estricta (uuid, text, uuid) y al wrapper (uuid, text), conservando EXECUTE para authenticated y service_role en la estricta y solo service_role en el wrapper.
- supabase/tests/rls/migration_chain_0024_0026.sql y rep_folio_org_scope.sql: nuevas aserciones de ACL DIRECTA con aclexplode — sin grant directo a anon en ninguna firma; grants directos exigidos a authenticated y service_role en la estricta y a service_role en el wrapper; el wrapper no debe tener grant directo a authenticated.
- Se conservan sin debilitar el escenario A/B, el usuario sin membresía, el portal con rol residual, la ausencia de is_internal_member al aplicar 0026 sola y el SQLSTATE 42501 exacto.
- Migración aún NO aplicada (forward-only, 0024→0025→0026); no se ejecutó SQL contra producción ni se activó una segunda empresa.

## [8.10.4] - 2026-09-17 · patch · security

Las dos pruebas automáticas que vigilan el folio de complementos aceptaban configuraciones débiles: permitían que faltara la versión de compatibilidad del asignador y daban por buena cualquier ruta de búsqueda con solo mencionarla. Ahora exigen ambas versiones, la ruta de búsqueda exactamente 'public', el modo de ejecución con privilegios del dueño y los permisos exactos por tipo de usuario. Solo pruebas: sin tocar migraciones, lógica de negocio, roles reales ni datos.

- supabase/tests/rls/migration_chain_0024_0026.sql: ambas firmas del asignador son obligatorias; se verifica SECURITY DEFINER y search_path exactamente 'public' por proconfig en las dos firmas.
- Misma verificación para los ayudantes de aislamiento que necesita la cadena: current_organization_id, is_internal_member, user_in_current_organization e is_ops_staff.
- Permisos exactos: la firma estricta es ejecutable por authenticated y service_role, y NO por anon ni PUBLIC; la versión de compatibilidad solo por service_role, y NO por authenticated, anon ni PUBLIC (se revisa el ACL real, no solo has_function_privilege).
- supabase/tests/rls/rep_folio_org_scope.sql: la versión de compatibilidad deja de ser opcional y se añaden las mismas comprobaciones de search_path exacto y permisos por rol.
- Se conservan sin debilitar todos los casos previos: escenario A/B, usuario sin membresía, portal con rol operativo residual, ausencia de is_internal_member al aplicar 0026 sola, SQLSTATE 42501 exacto y no mutación entre empresas.
- Sin cambios en migraciones de producción, lógica de negocio, roles reales ni datos; nada se ejecutó contra la base productiva.

## [8.10.3] - 2026-09-17 · patch · docs

El commit `45c9293fe9ef844092772ca588728c4d8a7ce13d` confirmó en GitHub Actions que las pruebas de aislamiento de almacenamiento pasan completas: RLS 54/54, smoke 45/45, CI principal y Gitleaks en verde. El alcance sigue preciso y el alta de una segunda empresa permanece bloqueada. Solo documentación; sin SQL, sin producción.

- Run 35180736054 (RLS DB tests): 54/54 en verde; run 35180736071 (CI principal) y run 35180736167 (Gitleaks) en verde.
- Se actualizó el runbook `docs/multiempresa/storage-historico.md` con la evidencia final y el alcance preciso del residuo legacy.
- Alcance confirmado: rutas nuevas con prefijo de empresa aisladas entre organizaciones; legado de documentos aislado cuando su ficha registra `organization_id`; legado de `cfdi-files`, `supplier-payment-receipts`, `supplier-bill-cfdi-xml` y `feedback-screenshots` sigue compartido.
- El alta de una segunda empresa permanece bloqueada hasta migrar los 310 objetos históricos sin prefijo.
- Sin aplicar SQL, sin tocar producción, sin mover objetos, sin editar migraciones históricas.

## [8.10.2] - 2026-09-17 · patch · test

Se completó el escenario automático de documentos con las cuentas activas de portal de ambas empresas, para que la identidad de cada cliente se resuelva por su empresa sin recurrir al respaldo heredado. No se cambiaron llaves, permisos, reglas de acceso, migraciones ni datos reales.

- Las cuentas sintéticas de portal A y B quedaron vinculadas coherentemente con su usuario, cliente, correo, membresía y relación comercial dentro de cada empresa.
- El cliente global A conserva una relación comercial válida con ambas empresas, pero su cuenta de portal A solo representa a la empresa A; el portal B usa otro usuario y correo en la empresa B.
- Se conserva el comportamiento seguro con varias empresas: `get_customer_id_for_user` no recurre a `customers.user_id` cuando hay más de una organización activa.
- El texto histórico de 8.9.0 sigue corregido: solo las rutas nuevas con carpeta de empresa y el legado de documentos con ficha dueña están aislados; los demás archivos históricos sin prefijo siguen compartidos y bloquean el alta de una segunda empresa.
- Sin cambios en producción, migraciones, llaves foráneas ni reglas de acceso.

## [8.10.1] - 2026-09-17 · patch · docs

Se ajustaron las descripciones de 8.9.0 para limitar el aislamiento a rutas nuevas con prefijo de empresa y al archivo histórico de documentos cuando su ficha registra la empresa dueña. El archivo histórico de los demás almacenes (fiscales, comprobantes de proveedores, XML de facturas y capturas) se declara expresamente como compartido entre empresas: el riesgo histórico NO se cerró y el alta de una segunda empresa sigue bloqueada hasta trasladarlo. Solo documentación; sin cambios de código, migración ni datos.

- Corrección del texto de 8.9.0: el título y la descripción afirmaban de forma general que todos los archivos quedaron encerrados en su empresa. Ahora limitan el aislamiento a rutas nuevas con carpeta de empresa y al legado de documentos con ficha dueña.
- Se declara expresamente que el legado de archivos fiscales, comprobantes de proveedores, XML de facturas de proveedor y capturas SIGUE compartido entre empresas porque no hay dato que identifique al dueño de cada archivo antiguo.
- Se deja registrado que el riesgo histórico NO se cerró y que el alta de una segunda empresa queda bloqueada hasta que el traslado del archivo histórico esté probado y ejecutado por su canal autorizado.
- Sin cambios de código, migración, datos ni despliegue; solo documentación y versionado.

## [8.10.0] - 2026-09-17 · minor · security

Se arreglaron los dos exámenes automáticos que salieron en rojo, se cerró por empresa el archivo histórico de documentos usando el dueño que ya está registrado en la ficha, y se corrigió la redacción previa: el archivo histórico de los demás almacenes SIGUE compartido y el alta de una segunda empresa queda bloqueada hasta trasladarlo.

- Corregido un examen que contaba mal: el escenario crea cinco archivos de la empresa B (uno por almacén) y la prueba exigía cuatro; ahora se verifica almacén por almacén para que un total no pueda compensar una pérdida.
- Corregido el examen heredado de documentos: no asignaba empresa a documentos ni facturas ni daba de alta las membresías, así que el cliente del portal no veía su propio archivo. Ahora usa dos empresas inventadas, con documentos, facturas y membresías correctas, conservando las comprobaciones propias y añadiendo las cruzadas. No se debilitó ninguna regla para que pasara.
- La cuenta de portal del escenario cruzado ya tiene su membresía de tipo portal: sin ella el sistema no resuelve a qué empresa pertenece.
- Nuevo límite en el cambio de base 0027 (no aplicado en producción): para el almacén de documentos, un archivo histórico sin carpeta de empresa deja de ser accesible al personal de otra empresa, porque su ficha ya dice a qué empresa pertenece. Los archivos huérfanos sin ficha conservan el comportamiento actual.
- Corrección de la redacción anterior: el riesgo del archivo histórico NO quedó cerrado. En archivos fiscales, comprobantes de proveedores, XML de facturas de proveedor y capturas no hay dato que diga de quién es cada archivo antiguo, así que el personal de una futura segunda empresa podría leerlos o borrarlos. Se añadió una comprobación explícita que falla si alguien da ese límite por cerrado sin trasladar los archivos.
- Queda expresamente bloqueada el alta de la segunda empresa hasta que el traslado de los archivos históricos esté probado y ejecutado por su canal autorizado.
- Revisión de todos los puntos donde se abre un archivo guardado: hoy solo se guardan rutas propias del sistema y no hay enlaces de otros sitios en la base, por lo que rechazarlos no rompe nada. Se agregaron casos de enlace mal formado o con separador disfrazado: no se abren y no provocan un error sin control.
- Nada se aplicó en producción: sin cambios de base, sin mover archivos, sin desplegar y sin editar historial.

## [8.9.0] - 2026-09-17 · minor · security

Se cerraron los huecos que permitían que el personal de una empresa leyera, reemplazara o borrara archivos de otra en rutas nuevas con carpeta de empresa, y el archivo histórico de documentos quedó acotado por la ficha que ya registra la empresa dueña. El archivo histórico de los demás almacenes (archivos fiscales, comprobantes de proveedores, XML de facturas de proveedor y capturas) SIGUE compartido entre empresas porque no hay dato que identifique al dueño de cada archivo antiguo; el riesgo histórico NO se cerró y el alta de una segunda empresa queda bloqueada hasta trasladarlo. Los enlaces antiguos guardados ahora se vuelven a autorizar con la sesión actual en vez de abrirse tal cual. Incluye pruebas nuevas con dos empresas inventadas.

- Hallazgo real: las reglas de documentos (alta, reemplazo y borrado), las de capturas de administración y las de archivos fiscales, comprobantes de proveedores y XML de facturas de proveedor solo revisaban el rol, no la empresa dueña del archivo.
- Hallazgo real: la lectura de documentos del portal se resolvía por el cliente global, así que un mismo cliente dado de alta en dos empresas podía alcanzar documentos de la otra.
- Nuevo cambio de base 0027 (no aplicado en producción): toda alta exige la carpeta de la empresa de la sesión; lectura, reemplazo y borrado rechazan cualquier carpeta de otra empresa en rutas nuevas con prefijo; un archivo propio ya no puede moverse a la carpeta de otra empresa. Para el almacén de documentos, un archivo histórico sin carpeta deja de ser accesible al personal de otra empresa cuando su ficha registra la empresa dueña. Los archivos históricos sin carpeta de los demás almacenes (fiscales, comprobantes de proveedores, XML de facturas y capturas) SIGUEN compartidos entre empresas: no hay dato que identifique al dueño, así que el riesgo histórico NO se cerró y no se movió ninguno.
- Los enlaces antiguos guardados con caducidad de años ya no se abren tal cual: si apuntan al almacenamiento del propio sistema se vuelven a autorizar con la sesión actual y caducan en un minuto; cualquier otro enlace no se abre y avisa al usuario.
- Nueva prueba supabase/tests/rls/storage_cross_org_ab.sql con dos empresas, dos administradores y una cuenta de portal inventados: comprueba que la empresa A no puede ver, listar, reemplazar ni borrar archivos de la empresa B en rutas nuevas con prefijo en los cinco almacenes, e incluye comprobaciones positivas para que la prueba no pase por falta de datos. Las rutas históricas sin prefijo de los almacenes sin ficha dueña quedan declaradas como riesgo compartido, no como aislamiento probado.
- Nuevas pruebas de interfaz para la apertura de archivos: enlace propio se vuelve a firmar, enlace de otro sitio o de otro almacén no se abre.
- No se ejecutó nada en producción: no se aplicó el cambio 0027, no se movieron archivos, no se creó una segunda empresa y no se editó ninguna migración histórica. El alta de la segunda empresa queda bloqueada hasta que el traslado del archivo histórico esté probado y ejecutado por su canal autorizado.

## [8.8.35] - 2026-09-17 · patch · docs

Se corrigió la guía del folio de complementos con el resultado final de la revisión de huellas del historial de cambios de base: solo documentación, sin cambio funcional.

- Corrección del registro previo: son cinco diferencias históricas de huella (cambios 0004, 0005, 0006, 0007 y 0010); el aviso sobre 0009 fue una falsa alarma y el resto del historial hasta 0023 coincide.
- Las huellas abreviadas se verificaron por recálculo directo antes de escribirlas; no se inventó ningún valor.
- Documentado con el código real del componente: la huella se guarda pero el sistema avanza por fecha sin compararla, así que una huella distinta no provoca error ni reaplicación.
- Evidencia documentada: las 13 funciones verificadas coinciden con producción, las funciones bancarias tienen el modo de seguridad correcto y existen las 55 reglas por empresa y los 57 guardias de escritura; la conclusión queda limitada a los objetos comprobados.
- Recomendación: no reescribir huellas ni archivos históricos; cualquier verificación estricta futura debe ser aditiva y propia, nunca retroactiva.
- Se aclaró que el ensayo aislado de 0024 a 0026 ya pasó en la revisión automática; siguen pendientes el despliegue productivo, la decisión del permiso residual de la cuenta de portal, el ensayo de almacenamiento con dos empresas y el alta de la segunda empresa.
- Sin cambio funcional: no se tocó código, migraciones, historial, base de datos ni producción.

## [8.8.34] - 2026-09-17 · patch · security

Se agregó una prueba automática que ensaya, sobre una base temporal y con dos empresas inventadas, el mismo orden de cambios que tendría producción.

- Nueva prueba supabase/tests/rls/migration_chain_0024_0026.sql con datos ficticios: dos empresas, cuatro usuarios internos y una cuenta de portal con permiso operativo residual. No usa datos ni usuarios reales.
- Verifica que las reglas de acceso globales antiguas de perfiles y roles ya no existen y que están en su lugar las nuevas reglas por empresa.
- Verifica los permisos exactos del folio de complementos: la versión nueva para sesiones y canal interno; la versión antigua de compatibilidad solo para el canal interno.
- Verifica el comportamiento: un usuario sin empresa no resuelve ninguna; la cuenta de portal con permiso residual no pasa como personal interno; un administrador de la empresa A no puede folear un pago de la empresa B y ese pago no se modifica; repetir el flujo válido no duplica folios; el canal interno reconcilia sin duplicar.
- Incluye una comprobación que reproduce la brecha actual de producción: al faltar la función de membresía del cambio 0025, la llamada con sesión falla; la prueba lo demuestra y revierte el estado enseguida.
- No se modificaron los cambios 0024, 0025 ni 0026 ni se ejecutó nada en producción; no se creó una segunda empresa, no se movió almacenamiento y no se retiró ningún índice.

## [8.8.33] - 2026-09-17 · patch · docs

Se actualizó la guía del folio de complementos con una revisión directa de producción: hoy la base productiva no está lista para aplicar ese cambio, y queda escrito por qué y en qué orden hacerlo.

- El historial de cambios de base de producción termina en el número 0023: los cambios 0024, 0025 y 0026 siguen pendientes. Que exista una función con nombre conocido no prueba que el cambio 0024 ya esté aplicado.
- Faltan en producción las dos funciones de membresía del cambio 0025 y siguen activas las reglas de acceso antiguas de perfiles y roles, sin sus versiones por empresa.
- El cambio 0025 no solo agrega una función: reemplaza funciones y reglas de acceso. Hay 5 miembros (4 internos y 1 de portal) y una cuenta de portal con permiso operativo residual que dejaría de contar como personal interno; se marcó como validación previa obligatoria con el área de negocio.
- Se explicó por qué el cambio 0026 no debe aplicarse solo: se instala sin error, pero falla al usarse desde una sesión, mientras el canal interno no lo nota. Por eso la revisión automática en verde no acredita que producción esté lista.
- Secuencia propuesta y no ejecutada: 0024, luego 0025 revisando el efecto del permiso de portal, luego 0026; después verificar privilegios y probar ambos caminos en una base aislada con dos empresas, y solo entonces publicar las funciones.
- Se anotaron diferencias de huella entre el historial y los archivos actuales de cuatro cambios antiguos (0004, 0005, 0006 y 0010), a reconciliar antes de confiar en una verificación estricta del historial.
- Cambio solo de documentación: no representa cambio funcional. No hubo cambios en producción, no se creó una segunda empresa, no se movió almacenamiento y el Lote 2 sigue pendiente.

## [8.8.32] - 2026-09-17 · patch · docs

Se registró la auditoría de solo lectura del almacenamiento de archivos históricos: todo queda documentado como propuesta, sin tocar código, base de datos, archivos ni permisos.

- Nuevo documento docs/multiempresa/storage-historico.md: 6 espacios de almacenamiento privados, 310 archivos, 25 reglas de acceso y una sola empresa activa.
- Confirmado: los 310 archivos históricos se guardan sin carpeta de empresa; hoy no hay riesgo, pero lo habría al dar de alta una segunda empresa.
- Se documentó el riesgo de las rutas antiguas que se abren tal cual, aunque no se encontraron referencias guardadas como enlace web.
- Se documentó un plan reversible de traslado: copiar, verificar huellas digitales, actualizar referencias, convivencia temporal y borrado final solo con autorización expresa.
- Precondición crítica anotada: producción aún no tiene la función de membresía que necesita el cambio del folio de pago; debe aplicarse en orden y probarse como usuario autenticado y como canal interno.
- Cambio solo de documentación: no representa cambio funcional; el traslado no está autorizado ni ejecutado.

## [8.8.31] - 2026-09-16 · patch · docs

Se actualizó la guía del tramo 8.1 con el estado aprobado en repositorio, los runs de CI verdes, el preflight actual y un runbook explícito para aplicar la migración en producción.

- Se dejó el estado final: 8.8.30 aprobado en repositorio (commit 3c039b1b), con CI principal y RLS/smoke en verde; producción sigue pendiente con sólo la firma de dos parámetros.
- Se agregó el preflight actual: 82 pagos, 25 con folio, cero sin organización, cero duplicados; un reporte, cero duplicados.
- Se documentó que feedback_reports_folio_key es una constraint UNIQUE global que convive con la por organización; retirarla requiere ALTER TABLE, no DROP INDEX.
- Se añadió el runbook: aplicar 0026, verificar ambas firmas y privilegios, desplegar Edge Functions después, smoke en entorno aislado, repetir preflight y no dar de alta la segunda empresa hasta cerrar el bypass.
- Se conservó el orden seguro y el rollback conceptual sin aplicar DDL.

## [8.8.30] - 2026-09-16 · patch · seguridad

Se cerró un hueco: tener permiso de administrador no basta; ahora hay que pertenecer a la empresa dueña del pago para asignarle folio.

- Un administrador de una empresa ya no puede asignar folio a un pago de otra empresa, ni siquiera omitiendo el dato de empresa.
- La empresa se toma siempre de la sesión verificada y del propio pago, nunca de lo que envía quien llama.
- La forma antigua de la función quedó reservada al canal interno del sistema: se revisó que ningún uso desde el navegador la necesite.
- Nueva prueba con dos empresas: tres intentos de cruce fallan y el pago ajeno no cambia, mientras el flujo correcto sigue funcionando.
- Se conservan la repetición segura del mismo folio, el rechazo de sobreescritura y el índice actual.

## [8.8.29] - 2026-09-16 · patch · fix

El ajuste de base para el folio del complemento de pago dejó de estar solo en documentación: ahora es un cambio real del repositorio que se prueba automáticamente.

- Se agregó el cambio de base al carril que la revisión automática aplica sobre una base recién creada.
- Se detectó y corrigió un choque de versiones que habría hecho fallar las llamadas antiguas; el tercer dato ahora es obligatorio.
- Se probó en una base temporal: flujo válido, repetición del mismo folio, folio distinto, empresa ajena, pago sin empresa, folio faltante, pago inexistente y usuario sin permiso.
- La revisión automática ahora sí ejecuta la revisión de cambios de base cuando viven en este carril, en lugar de omitirla.
- El respaldo del programa queda solo como emergencia y deja aviso en bitácora; el índice actual se conserva.

## [8.8.28] - 2026-09-16 · patch · fix

Se corrigió el riesgo de que el folio del complemento de pago fallara si el cambio de la base y el del programa se activaban en distinto orden.

- La versión nueva de la base convive con la anterior: la forma antigua se conserva y reenvía a la nueva, así que ningún proceso queda sin folio.
- Si el cambio de la base todavía no está aplicado, el sistema reintenta por el camino anterior en lugar de dejar el complemento timbrado sin folio.
- La prueba de seguridad del folio ahora falla si el cambio de la base no está aplicado, en lugar de pasar sin revisar nada.
- Se documentó el orden obligatorio: aplicar el cambio de base, verificar en integración continua y sólo después publicar; el índice actual se conserva.

## [8.8.27] - 2026-09-16 · patch · fix

El folio interno del complemento de pago ya se asigna dentro de la empresa dueña del pago, y si algo falla después de timbrar ante el SAT el sistema lo dice y lo recupera solo, sin volver a timbrar.

- El folio del complemento se pide siempre con la empresa verificada del pago; nunca con datos enviados por el navegador.
- Si el complemento ya se timbró pero el folio no se pudo asignar, el sistema ya no responde éxito con folio vacío: avisa y deja el motivo visible.
- La revisión automática de timbrados recupera el folio de los complementos que quedaron sin él, dentro de su propia empresa y sin repetir el timbrado.
- Nuevas pruebas de pago de otra empresa, doble ejecución, choque de folio y recuperación; se conserva el índice actual y no se aplicó ninguna migración.

## [8.8.26] - 2026-09-15 · patch · documentación

Se midió, solo con consultas de lectura, cuántos datos chocarían si cada catálogo pasara a ser propio de cada empresa.

- Nuevo documento docs/multiempresa/tramo-7-colisiones-unicidad.md con las consultas usadas y los conteos agregados.
- Cero duplicados y cero filas sin empresa en flota, mecánicos, operadores, refacciones, prospectos, pagos, reportes y proveedores.
- Se documentó el efecto del borrado lógico, los índices parciales y el RFC normalizado sobre el resultado.
- Recomendación reversible por lotes y decisión pendiente sobre proveedores; no se aplicaron migraciones, índices ni escrituras.

## [8.8.25] - 2026-09-15 · patch · corrección

Las plantillas de contrato y la búsqueda de clientes ya se resuelven dentro de la empresa verificada, y los choques de catálogos compartidos explican qué hacer.

- La plantilla de contrato predeterminada se lee por empresa verificada, con estados explícitos de ausencia, ambigüedad y error de lectura.
- El PDF de contrato toma la plantilla de la empresa dueña del contrato en lugar del primer registro disponible.
- La búsqueda global parte de la relación comercial de la empresa y une el cliente global, sin depender de datos del navegador.
- Los choques de unicidad en flota, mecánicos, operadores, refacciones, proveedores y modelos se traducen a mensajes seguros y accionables.
- Nuevas pruebas de ausencia, ambigüedad y aislamiento entre empresas; sin migraciones, índices ni escrituras en producción.

## [8.8.24] - 2026-09-15 · patch · documentación

Se documentó, sin cambiar la base, qué catálogos comparten unicidad global y cuáles deberían ser propios de cada empresa.

- Nuevo documento `docs/multiempresa/tramo-6-unicidad-catalogos.md` con el inventario de índices únicos leído de producción.
- Matriz propuesta global / por organización / por relación, riesgos históricos y plan de migración reversible por lotes.
- Consultas que dependen de una unicidad frágil identificadas; no se aplicaron migraciones, índices ni escrituras.

## [8.8.23] - 2026-09-15 · patch · corrección

Se corrigió el fixture que confundía una lectura vacía por aislamiento con un cambio de rol.

- El intento cruzado y la RPC siguen ejecutándose como administrador de A.
- El rol del administrador de B se comprueba en un bloque autenticado como B y luego se restablece el contexto de A.
- Se conservan la comprobación del último administrador por empresa y el flujo válido de A, sin tocar políticas ni la migración 0025.

## [8.8.22] - 2026-09-15 · patch · corrección

Se corrigieron dos fixtures de pruebas de seguridad que fallaban desde una base limpia, sin relajar el aislamiento entre empresas.

- La prueba de bitácora de actividad crea membresías internas para administrador, despachador y ventas antes de validar lecturas.
- La prueba de administración cruzada respeta el índice único de un rol por usuario al asignar roles.
- No se modificaron current_organization_id, las políticas de aislamiento ni el modelo de datos.

## [8.8.21] - 2026-09-15 · patch · corrección

Migración de aislamiento administrativo compatible con UUID desde una base limpia.

- `current_organization_id()` deja de aplicar una agregación no disponible para UUID y obtiene el único valor mediante `array_agg`.
- Se conserva el contrato cerrado: devuelve la organización sólo con exactamente una membresía; con cero o varias devuelve `NULL`.
- No cambian el modelo, las políticas, los permisos ni el alcance de la migración 0025.

## [8.8.20] - 2026-09-15 · minor · seguridad

Administración, invitaciones y roles acotados a la organización verificada (tramo 5 multiempresa).

- Nuevo `src/lib/organization/adminScope.ts` (`resolveInternalScope`, `resolveTargetScope`): la empresa sale de `organization_memberships` y un objetivo de otra empresa es indistinguible de uno inexistente.
- Nuevos guards `requireInternalOrganization`, `assertTargetInOrganization` y `createInternalMembership` en `adminGuards.server.ts`; autorizan antes de cualquier lectura privilegiada y distinguen `read_error` (503) de `not_found` (404).
- `inviteUserFn`, `deleteUserFn`, `resetUserPasswordFn` y `toggleUserStatusFn` verifican la organización del objetivo; el alta crea la membresía `internal` y el borrado la elimina.
- `inviteCustomerFn` exige relación activa en `organization_customers` y crea `customer_portal_accounts` + membresía `portal` con compensación ante fallo.
- `assertNotLastActiveAdmin` evalúa el invariante del último administrador por organización.
- Migración revisable `0025_multi_org_phase8_admin_membership_scope.sql` (no aplicada): `current_organization_id` sin `LIMIT 1` arbitrario, `is_internal_member`, `user_in_current_organization`, RLS de `profiles`/`user_roles` por organización y `update_user_role_safe`/`assert_not_last_admin` acotadas.
- Nueva suite `supabase/tests/rls/admin_cross_org.sql` y pruebas Vitest del alcance de administración.

## [8.8.19] - 2026-09-15 · minor · seguridad

Prospectos y operaciones escriben siempre en la organización verificada (tramo 4 multiempresa).

- Nuevo `src/lib/organization/writeContext.ts` (`stripOrganizationId`, `WithoutOrganization`): ningún payload del navegador viaja con `organization_id`.
- `useProspects`/`useProspectMutations`, `useCreateForklift`/`useUpdateForklift`, `useDamageRecords`, `useMaintenanceLogs` y `useMaintenanceLabor` dejan de aceptar la organización como campo editable.
- Se conservan sin cambios el trigger `enforce_organization_write_context`, las policies `org_scope_isolation` y las validaciones de propietario/cliente.
- Nueva suite `supabase/tests/rls/operations_cross_org.sql`: A no lee ni modifica registros de B, los IDs directos de B no filtran datos, un payload con la organización de B se rechaza (42501), un alta sin organización queda en A y el portal no alcanza operaciones internas.
- Pruebas Vitest del saneado y de los payloads de prospectos.

## [8.8.18] - 2026-09-15 · minor · seguridad

Emisor de documentos resuelto por organización verificada (tramo 3 multiempresa).

- Nuevo `resolveIssuerBranding` + server fn `getIssuerBranding` (`requireSupabaseAuth`): razón social, RFC, régimen, lugar de expedición y logo salen de la organización verificada y, cuando aplica, de la organización propietaria del documento.
- `fetchCompanyDataAndLogo` deja de leer `company_settings` con `limit(1)`; ahora recibe el documento (factura, cotización, contrato, cliente) y verifica pertenencia y acceso del usuario o cuenta de portal.
- Estados explícitos `no_organization`, `document_not_found`, `document_forbidden`, `settings_missing`, `settings_ambiguous` y error de lectura; sin empresa de respaldo ni herencia entre organizaciones.
- `companySettingsQueries` y `cxpApprovalThresholdQueries` piden 2 filas y tratan la duplicidad como error explícito en lugar de elegir una arbitraria.
- `get_public_branding` (LiftGo fija) y los secretos fiscales quedan intactos; sólo se expone configuración pública y el indicador `facturapi_mode`.

## [8.8.17] - 2026-09-15 · minor · seguridad

Caché de TanStack Query aislada por identidad verificada (usuario + organización).

- `IdentityScopedPersistence` reemplaza el `PersistQueryClientProvider` global: purga, restaura y persiste bajo `liftgo:rq-cache:v4:{identidad}`.
- Se eliminan las claves globales `liftgo:rq-cache:v1..v3` y las de cualquier otra identidad presentes en `localStorage`.
- Nada se restaura antes de que `AuthProvider` y `OrganizationProvider` estén en `ready`; al cambiar identidad se cancelan consultas en vuelo y se purga la caché antes de renderizar.
- `AuthQueryCacheSync` se conserva y purga todo salvo la consulta de identidad (`organization-context`).
- `portalKeys` usa la identidad verificada en lugar de `user_id`; allowlist/blocklist de persistencia sin cambios.

## [8.8.16] - 2026-09-15 · minor · seguridad

Contexto de organización verificado en la aplicación y portal por cuenta verificada.

- `getOrganizationContext` (server fn con `requireSupabaseAuth`) resuelve la empresa desde `organization_memberships` y, en portal, desde `customer_portal_accounts` activa y coherente.
- `OrganizationProvider`/`OrganizationGate` exponen `loading`, `error`, `no-membership` y `ready`; `AuthGuard` no renderiza contenido protegido hasta `ready`.
- `usePortalCustomer` deja de usar `customers.limit(1)` y consulta el cliente verificado por ID.
- Migración revisable `0024_portal_fallback_respects_account_status.sql` (no aplicada): el respaldo `customers.user_id` sólo opera sin cuenta de portal.
- Nueva suite `supabase/tests/rls/portal_account_status_fallback.sql` y pruebas Vitest del resolver, del gate y del portal.

## [8.8.15] - 2026-09-15 · patch · pruebas

Smoke SQL alineado con la migración 0023.

- R6-15 verifica que la policy llame `invoice_eligible_for_payment_intent(invoice_id)` y que no consulte `invoices` directamente.
- Nuevas aserciones sobre `pg_temp.fndef('invoice_eligible_for_payment_intent')`: `cancelled`, `draft`, `cancellation_status IS DISTINCT FROM accepted`, cliente propietario y organización de la sesión.
- Se conservan las aserciones de `payment_proof_path_allowed`, `storage_relative_segments` e `invoice_in_current_organization`.

## [8.8.14] - 2026-09-15 · patch · seguridad

Reporte de pago del portal desbloqueado sin perder aislamiento multiempresa.

- Nueva función interna `invoice_eligible_for_payment_intent` (SECURITY DEFINER) que evita la subconsulta a `invoices` bajo RLS dentro de la policy.
- Se conservan cliente propietario, organización de la sesión, estado de factura, `payment_proof_path_allowed` y la igualdad del segmento de factura en la ruta.
- Guards de diagnóstico y rechazos cross-tenant ampliados en `supabase/tests/rls/storage_org_prefix.sql`.

## [8.8.13] - 2026-09-15 · patch · ui

Pantalla de acceso homologada con el sitio público liftgo.com.mx.

- Panel de marca en azul marino `#0B1F3E` con acento dorado `#C39B76` y títulos en Montserrat.
- Fondo claro `#FCF7F4` y botón principal en el dorado `#B8862B`, en mayúsculas, al estilo del sitio.
- Distintivo tipográfico "Lift Go / Montacargas" cuando no hay logotipo cargado.
- Los tokens nuevos viven en `.auth-brandscape`: el interior de la app conserva su paleta y tipografía.

## [8.8.12] - 2026-09-15 · patch · test

Setup RLS de Storage ordenado desde el primer registro ficticio.

- El contexto local de la organización A se establece antes de insertar cualquier organización de prueba.
- Las organizaciones A y B se crean por separado, manteniendo contexto explícito para todos los disparadores del montaje.
- Las sesiones autenticadas siguen limpiando el contexto del setup y se conservan intactas las pruebas positivas y de rechazo entre empresas.
- No se modificaron el guardia de escritura, las políticas RLS ni la migración 0022.

## [8.8.11] - 2026-09-15 · patch · test

Arnés RLS multiempresa con contexto explícito, sin cambios en producción.

- La preparación usa la conexión privilegiada del runner sólo para insertar datos de soporte y establece `app.organization_id` para los disparadores que requieren atribución explícita.
- Antes de cada escenario autenticado se limpian rol, JWT y contexto; después se simula de nuevo una sesión real de la organización A.
- Se conservan los rechazos cross-tenant de lectura, subida y borrado en Storage, además de factura y `proof_url` ajenos en `customer_payment_intents`.
- No se modificaron el trigger `enforce_organization_write_context`, las políticas RLS ni la migración 0022.

## [8.8.10] - 2026-09-15 · patch · security

Aislamiento completo de archivos entre organizaciones (migración 0022).

- Subir un comprobante exige la carpeta de la empresa de la sesión y una factura de esa misma empresa.
- Leer o borrar comprobantes, capturas de feedback y documentos de otra empresa queda bloqueado.
- El reporte de pago del portal sólo se acepta si la factura y el comprobante son de la empresa de la sesión.
- Nueva suite RLS `supabase/tests/rls/storage_org_prefix.sql` con dos organizaciones y un cliente compartido.
- Smoke `r_fix32_portal_pagos_smoke.sql` actualizado al contrato real (R6-15/R6-25).

## [8.8.9] - 2026-09-15

### Permisos de Storage compatibles con el prefijo de organización

- Migración `0021_storage_policies_org_prefix_aware`: nueva función `public.storage_relative_segments(text)` (SECURITY DEFINER) que descarta el primer segmento cuando corresponde a una organización existente, y lo conserva para objetos legados sin prefijo.
- Políticas actualizadas en `storage.objects`: `Customers upload/read/delete own proofs` (payment-proofs), `Users upload/read/delete own feedback screenshots` (feedback-screenshots) y la rama de `mechanic` en `Staff read documents` (documents).
- Política `Customers create own payment intents` en `public.customer_payment_intents`: la validación de `proof_url` (cliente/factura) se hace sobre la ruta relativa, sin el prefijo de organización.
- Corrige 3 hallazgos de monitoreo: comprobante de pago del portal rechazado siempre, captura de feedback rechazada y URLs firmadas de documentos fallando para mecánicos.

## [8.8.8] - 2026-09-15

### Cierre del parche fiscal: `deno fmt` de CI, `organizations` ilegible y regresiones ampliadas

- `deno fmt` aplicado a `validate-receptor-tax-info/handler.ts` y `download-cfdi/handler.ts`, los 2 archivos que `deno fmt --check` reportaba en el job "Funciones Supabase (Deno, sin red)" antes de ejecutar las pruebas. Verificación final ejecutada como en CI: `cd supabase/functions && deno fmt --check && deno lint` sobre los 132 archivos, no sobre una selección.
- `_shared/facturapi/client.ts`: nuevo `readSoleLegacyOrganizationStrict`. En el camino de resolución fiscal, un error al leer `organizations` ya no se degrada a "el fallback no aplica": se propaga como `FacturapiConfigError('config_read_error')`, sin llave, sin entorno y sin timbrado stub. `isSoleLegacyOrganization` conserva su semántica booleana fail-closed para el resto de consumidores.
- Pruebas nuevas de helper (`_shared/facturapi/orgConfig_test.ts`): `organizations` ilegible con modo `test` y sin llave propia → `config_read_error`; el mismo caso vía `loadFacturapiConfigOutcome` → 503; `isSoleLegacyOrganization` sigue devolviendo `false` ante error.
- Pruebas nuevas de portal (`download-cfdi/handler_test.ts`): descarga correcta de **acuse**, **REP** y **nota de crédito** propios (antes sólo factura); cuenta **revocada** cubierta explícitamente; cuenta de otro usuario rechazada (los fixtures ahora respetan `auth_user_id` además de `member_type` y `status`); recuperación desde un PAC simulado que comprueba que se invoca `deps.fetchImpl` y que viaja **sólo** la llave de la empresa dueña del documento (`Authorization: Bearer <llave de la empresa>`), con una llave global de entorno presente y sin usar. Los casos negativos siguen sin PAC ni Storage.
- Prueba nueva de handler (`stamp-cfdi/handler_test.ts`): error de lectura de configuración fiscal **después** del claim → 503, liberación de la reserva (`cfdi_status = 'error'`), sin llamada al PAC, sin UUID y sin marcar la factura como timbrada.
- Validación local (no es CI): `deno fmt --check` y `deno lint` completos, y la selección offline de pruebas Deno. Sin migraciones, escrituras en producción, operaciones fiscales reales ni despliegues.

## [8.8.7] - 2026-09-14

### Corrección de la fase fiscal: portal, configuración explícita y cola de reintentos

- `download-cfdi`: nueva ruta de acceso para clientes del portal. `_shared/orgContext.ts` incorpora `resolvePortalAccess`, que exige exactamente una fila ACTIVA en `customer_portal_accounts` y una membresía `member_type = 'portal'` de la MISMA organización (0 o >1 filas → 403; error de lectura → 503; discrepancia → 403). El resolver interno sigue exigiendo `member_type = 'internal'` y no acepta cuentas de portal. Se conserva la doble restricción organización + cliente propietario para factura, acuse, REP y nota de crédito; en REP se verifica además que la factura relacionada pertenezca a la misma organización.
- `download-cfdi` usa `deps.fetchImpl` y `deps.env` en todas las rutas (antes algunas llamadas usaban `fetch`/`Deno.env` globales), de modo que los espías de las pruebas interceptan el transporte real y "cero llamadas al PAC" es un contador conectado.
- `_shared/facturapi/client.ts`: `FacturapiConfigError` con códigos `config_read_error` | `config_missing` | `config_invalid_mode` | `organization_required`. `getFacturapiConfigForOrganization` falla explícitamente ante error de lectura de `company_settings`/`billing_secrets`/`organizations`, configuración ausente o modo inválido; no cae a `test` ni al entorno. `modeOverride: null` se trata como configuración ausente (cierra el hueco de `stamp-credit-note`). Nuevo `loadFacturapiConfigOutcome` traduce el fallo a HTTP (503 lectura, 400 configuración) sin excepciones, y los handlers con reserva liberan el claim antes de responder.
- `process-cfdi-retry-queue`: nueva `classifyInvoiceReadOutcome` en `decisions.ts` distingue el fallo transitorio de lectura (`deferred`: status `pending`, sin subir `attempts`, con `next_retry_at`, sin PAC) de la factura realmente sin organización (`exhausted`). Se conserva el aplazamiento seguro por `!apiKey`.
- Pruebas: portal (cliente legítimo descarga, otra empresa, otro cliente, cuenta suspendida, membresía interna que no habilita el portal, error de membresía → 503, REP de factura ajena bloqueada) con mocks sensibles a filtros (`selectsByFilter` en `_shared/test/supabaseClientMock.ts`, respeta `status` y `member_type`); errores en cada lookup fiscal, modo ausente/inválido y `modeOverride: null`; aplazamiento sin agotar en la cola.
- Validación local: `deno fmt`, `deno lint` (56 archivos, 0 problemas), `deno check` de los archivos modificados y la selección offline de CI → **368 pruebas verdes, 0 fallos**. Las suites completas y la cobertura corresponden a GitHub Actions. Sin migraciones, escrituras en producción, operaciones fiscales reales ni despliegues.

## [8.8.6] - 2026-09-14

### CI Deno en verde (formato y lint de las funciones)

- `deno fmt` aplicado a los 17 archivos que `deno fmt --check` reportaba sin formatear en el job "Funciones Supabase (Deno, sin red)".
- `deno lint` sin errores y sin desactivar reglas ni excluir archivos: `Record<string, any>` sustituido por interfaces locales `PaymentRow`/`RelatedInvoiceRow` (`stamp-payment-complement/handler.ts`) y `CreditNoteRow` (`cancel-credit-note/handler.ts`); `buildPlan` de `generate-recurring-invoices/index.ts` tipa `supabase: SupabaseClient` (se retira el `deno-lint-ignore` que había quedado sin uso) y las relaciones embebidas se convierten vía `as unknown as` para satisfacer el chequeo de tipos; `assert` sin usar retirado de `download-cfdi/handler_test.ts`.
- Sin cambios de comportamiento ni en las pruebas del aislamiento multiempresa de 8.8.5.
- Validación local: `deno fmt --check` (132 archivos), `deno lint` (131 archivos), `deno check` de los archivos modificados y la selección offline de pruebas Deno → 351 verdes, 0 fallos. La suite completa y la cobertura corresponden a GitHub Actions.

## [8.8.5] - 2026-09-14

### Aislamiento fiscal por empresa (fase 1 multiempresa)

- Nuevo `_shared/orgContext.ts` en las Edge Functions: `resolveCallerOrganization` (membresía interna; fail-closed 403/503/409), `assertDocumentOrganization`, `resolveDocumentOrganization` y `groupByOrganization`. La organización se deriva siempre del servidor (membresía o fila de BD), nunca del payload; un JWT `service_role` no hereda la del usuario.
- `_shared/facturapi/client.ts`: `getFacturapiConfig` (leía `limit(1)`) sustituido por `getFacturapiConfigForOrganization`, que filtra `company_settings` y `billing_secrets` por `organization_id`. El fallback a llaves de entorno sólo aplica mientras exista exactamente una organización (`isSoleLegacyOrganization`), con su retirada documentada.
- Verificación de organización antes de claims, UPDATE, lectura de secretos o llamada al PAC en `stamp-cfdi`, `cancel-cfdi`, `refresh-cancellation-status`, `download-cfdi`, `stamp-credit-note`, `cancel-credit-note`, `stamp-payment-complement`, `cancel-payment-complement`, `validate-receptor-tax-info` y `validate-customers-tax-info`.
- Tareas programadas separadas por empresa: `reconcile-stamping-invoices` agrupa con `groupByOrganization` y usa un cliente Facturapi por organización; `process-cfdi-retry-queue` deriva la organización de la factura en BD (nunca del payload) y sin organización resoluble marca la fila `exhausted` sin llamar al PAC; `generate-recurring-invoices` incluye organización en consulta, clave de agrupación y plan, y acota las corridas manuales a la organización del caller; `generate-recurring-maintenance` propaga el `organization_id` de la póliza a cada registro insertado.
- `cancel-credit-note`, `stamp-payment-complement` y `download-cfdi` reestructurados al patrón `handler.ts` (inyección de dependencias) + `index.ts` wrapper, sin cambio de comportamiento observable, para poder probarse sin red.
- Pruebas: nuevas suites `_shared/orgContext_test.ts`, `_shared/facturapi/orgConfig_test.ts`, `*/orgIsolation_test.ts` y `handler_test.ts` de `cancel-credit-note`, `stamp-payment-complement` y `download-cfdi`; fixtures existentes actualizados con `organization_id`. Validación local: selección offline de pruebas Deno → 351 verdes. Sin migraciones, sin cambios en BD ni despliegues.

## [8.8.4] - 2026-09-14

### Precisión en la documentación técnica

- §15.6: `ci.yml` ejecuta ESLint, `tsc`, `arch-check`, build, un smoke de arranque con `playwright.smoke.config.ts` (no la suite E2E completa), Vitest en 2 shards + merge de cobertura, y jobs condicionales Deno/lint SQL/dependency-review/actionlint. No ejecuta knip.
- §7: los archivos de ruta declaran sus propios guards (`module`/`minAccess` locales + `RoleGuard`); `src/app-routes/routes-config.tsx` es un registro heredado consumido por sidebar y búsqueda global, no la fuente efectiva de permisos en runtime. Se ajustan el mapa de carpetas, el paso para agregar rutas y las referencias.
- Diagrama: se retira el enlace directo Facturapi/AI → Postgres; los proveedores externos solo son invocados desde Edge Functions o código servidor.
- Se reemplaza "siguen desplegadas" por "presentes en el repositorio" (incluida la entrada 8.8.3 de este archivo): la presencia en Git no acredita un despliegue activo.
- Las notas multi-organización dejan de enumerar pendientes como hechos: esta revisión documental no certifica el cierre de la migración.

## [8.8.3] - 2026-09-14

### Documentación técnica alineada con el sistema actual

- `README.md` y `architecture.md` describen el stack real: React 19, Vite 8, TypeScript 6, Tailwind v4 y TanStack Start/Router con SSR.
- Diagrama, mapa de carpetas y sección de enrutamiento reescritos sobre rutas file-based (`src/routes/`, layouts `_main`/`_portal`, `routeTree.gen.ts` generado); se eliminan referencias a `src/App.tsx`, `src/main.tsx`, `react-router-dom`, `src/lib/routes-config.tsx` y `tailwind.config.ts`.
- Nueva §6.3: server functions (`createServerFn` en `src/lib/*.functions.ts`) vs Edge Functions Deno presentes en el repositorio (sin certificar su estado de despliegue).
- Despliegue documentado según `vite.config.ts` y `wrangler.jsonc`: build SSR con Nitro, preset `cloudflare-module`, salidas `dist/client` y `dist/server`; `bun run preview` = `wrangler dev --port 4173`.
- Testing actualizado: Vitest 4 con happy-dom (jsdom opt-in) y suite offline; Playwright sobre el build servido en 4173.
- Migraciones: se documenta `drizzle/migrations/` junto al historial de `supabase/migrations/`. Se marca la migración multi-organización como **en curso**, no terminada.
- Requisitos de entorno: Node `>=24` y Bun como runner.
- Validación local: `bun scripts/validate-changelog.ts` y verificación de que cada archivo/comando citado existe. Suite completa y cobertura en GitHub Actions.

## [8.7.1] - 2026-09-13

### Hallazgos QA: estado del montacargas en su ficha

- `deriveForkliftDisplayStatus` vuelve a usar `availability.rentedForkliftIds`: la ficha muestra `rented` cuando hay reserva `confirmed` vigente hoy, igual que FleetPage y el tablero. Mantenimiento/retiro/venta siguen mandando.
- Comentario obsoleto en `FleetPage.tsx` corregido (ya no afirma que el helper ignora las reservas).
- Hallazgo del filtro `?status=scheduled` en Entregas: no reproducible. `useTableFilters` usa storage `url` y lee `location.search`; verificado en preview con sesión administrativa (sólo entregas programadas en la lista).
- Validación local: 14 pruebas focalizadas de disponibilidad verdes. Suite completa y cobertura en GitHub Actions.

## [8.2.1] - 2026-09-10

### Correcciones de la auditoría QA

- RPC desligado: todas las llamadas que guardan `supabase.rpc` en una variable usan `supabase.rpc.bind(supabase)` (conciliación bancaria: consulta/KPIs/importación, portal de clientes, asignación de montacargas, puntos de feedback, facturas con saldo y el wrapper compartido `callRpc`).
- Dashboard: la alerta de facturas vencidas muestra el saldo pendiente en MXN (`balance_mxn`), con fallback a `balance` y luego a `total` para fixtures legacy; regresión añadida para factura parcialmente pagada.
- Reportes: utilización de flota con barras horizontales, nombre por barra, etiquetas truncadas y scroll interno; se conservan tooltip, porcentajes y exportación CSV.
- Conciliación bancaria: `get_bank_statement_lines_page` escapa `%`, `_` y `\` y aplica `ESCAPE '\'`; migración posterior para entornos donde la original ya corrió, sin tocar datos.
- Móvil: la acción primaria de Clientes, Reservas y Cotizaciones se renderiza al final de la lista, en flujo, con espacio de safe-area, en lugar del overlay fijo que tapaba las tarjetas.
- Validación local: `tsc --noEmit` limpio, ESLint sin errores en los archivos tocados y 366 pruebas focalizadas (1 timeout por carga, verde al reejecutar aislado). Suite completa y cobertura en GitHub Actions.

## [8.2.0] - 2026-09-09

### Correcciones integrales de lógica de negocio

- Facturas: `paid` sólo persiste con saldo cubierto por pagos convertidos y notas de crédito timbradas; el dashboard abre el flujo de pago y una reconciliación corrige facturas históricas inconsistentes.
- Notas de crédito: los descuentos fijos se prorratean por la cantidad acreditada; cada línea se liga a su partida fiscal origen y el claim atómico congela el snapshot que se envía al PAC.
- Flota: una reserva no convierte físicamente la unidad en rentada antes de completar la entrega; entrega, devolución, venta, contratos, daños y mantenimiento validan transiciones terminales y compromisos concurrentes bajo bloqueo.
- Daños y mantenimiento: reparar, facturar, archivar y restaurar conservan evidencia y estados coherentes; `pending`, `in_progress` y `waiting_parts` bloquean disponibilidad de forma uniforme.
- Conciliación bancaria: el fingerprint usa la descripción completa, el parser corta antes de hashear más de 50,000 líneas, la importación usa staging transaccional idempotente y los filtros/KPI se calculan en servidor con paginación real.
- Portal, feedback y ayuda: consultas de detalle independientes, colecciones paginadas, totales globales, cargas/errores recuperables, Kanban por estado y puntos agregados sin truncamiento.
- Validación local: typecheck y linter de migraciones limpios; lint conserva únicamente los 14 avisos preexistentes; 748 pruebas focalizadas verdes. Las migraciones y Edge Functions requieren el entorno Supabase/PAC de staging antes de producción.

## [8.1.12] - 2026-09-08

### UI-DEP-01 — Cabecera de detalle de reserva comprimida en escritorio mediano

- Estado original: a 1280 px los botones de acción (Crear contrato, Extender, Devolución Anticipada, Cambiar Estatus, Eliminar, Cancelar) comprimían la columna de texto y el número de reserva caía a dos líneas con el subtítulo casi sin espacio; a 1024 px título y subtítulo dejaban de verse y las acciones desbordaban con scroll horizontal. Resultado final: el bloque de acciones baja a su propia fila cuando no cabe y sus botones envuelven dentro del ancho disponible, sin desbordamiento en 1024/1280/1440.
- Ajuste mínimo de CSS en `src/components/layout/DetailPageHeader.tsx`: la fila de escritorio permite envolver (`lg:flex-wrap`), el título reserva al menos 20 rem (`lg:min-w-[20rem]`) y el bloque de acciones deja de ser rígido (`min-w-0` sin `shrink-0`) para que sus botones envuelvan dentro del ancho disponible sin desbordar.
- Sin cambios en botones, etiquetas, permisos, handlers, accesibilidad ni en el comportamiento móvil apilado. No se tocaron consumidores ni lógica de negocio. Verificación visual con sesión administrativa a 390/1024/1280/1440 px: título en una línea, subtítulo visible, los 6 botones visibles sin recorte. `tsc --noEmit` limpio, `lint` sin errores (14 avisos preexistentes), prueba focalizada `BookingDetail.test.tsx` 1/1. Suite completa, cobertura y smoke quedan a cargo de GitHub Actions.

## [8.1.11] - 2026-09-08

### Mantenimiento YAGNI - lote DEP-04 (Vite/Rolldown)

- Actualizacion dirigida con pins exactos: `vite` 8.1.5 -> 8.2.2 (devDependencies) y el override `rolldown` 1.2.1 -> 1.2.7. Se conserva el override para que Vite y Nitro sigan resolviendo la misma version controlada; no se agrego `rolldown` como dependencia directa.
- Transitivas movidas por exigencia del par: bindings nativos `@rolldown/binding-*` a 1.2.7 y `@oxc-project/types` a 0.148.0 (requerido exactamente por Rolldown 1.2.7). Sin otras familias tocadas.
- Sin cambios en Start 1.168.50, Router 1.170.33, Nitro 3.0.260603-beta, `@lovable.dev/vite-tanstack-config` 2.21.0, `@vitejs/plugin-react` 5.2.0, TypeScript, ESLint, Vitest/cobertura, Table, React, Tailwind, Supabase ni Bun. `@rolldown/plugin-babel` permanece en 0.2.3. Se conservan DEP-01/02/03 y el ajuste de `ErrorComponentProps`. Sin cambios en `vite.config.ts`, `wrangler.jsonc` ni `playwright.smoke.config.ts`.
- Validacion puntual en Lovable: `tsc --noEmit` limpio (exit 0), `lint` sin errores (exit 0, 14 avisos preexistentes) y 114 pruebas focalizadas verdes en 7 archivos de transporte, red, serializacion, rutas y recarga por chunk stale. Suite completa, cobertura y smoke del bundle real quedan a cargo de GitHub Actions.

## [8.1.10] - 2026-09-08

### Mantenimiento YAGNI - lote DEP-03 (par Start/Router)

- Actualizacion dirigida del par de enrutamiento con versiones exactas: `@tanstack/react-start` 1.168.32 -> 1.168.50 y `@tanstack/react-router` 1.170.18 -> 1.170.33 (Start 1.168.50 depende exactamente de Router 1.170.33). No se instalo el peer OPCIONAL `@rsbuild/core` ni se activaron RSC, React Compiler o plugins nuevos.
- Adaptacion de compatibilidad requerida por el typecheck: Router 1.170.33 tipa el `error` de los boundaries como `unknown`. En `src/routes/__root.tsx`, `RootErrorComponent` pasa de `{ error: Error; reset: () => void }` a `ErrorComponentProps` (tipo publico de la libreria). Sin casts a `any`, sin normalizadores nuevos y sin extraer componentes; `reportLovableError` ya acepta `unknown` y la UI no lee `error.message`. Ningun otro consumidor requirio cambios.
- Sin cambios en Vite/Rolldown, Nitro, TypeScript 5.9.3, ESLint, Vitest/cobertura, Table, React, Tailwind, Bun, workflows ni en la configuracion de Lovable; se conservan los lotes DEP-01 y DEP-02 y las guardas de chunks stale, shell, QueryClient por peticion, auth, scroll y serializacion de busquedas.
- Validacion puntual en Lovable: `tsc --noEmit` limpio, `lint` sin errores (14 avisos preexistentes) y 112 pruebas focalizadas verdes en 7 archivos de rutas y transporte (`routes.test.ts`, `routerCompatLocation.test.tsx`, `searchSerialization.test.ts`, `NavLinkActive.test.tsx`, `mainScrollRestoration.test.tsx`, `serverFnTransport.test.ts`, `authAttacher.test.ts`). Suite completa, cobertura y smoke quedan a cargo de GitHub Actions.

## [8.1.9] - 2026-09-08

### Mantenimiento YAGNI - lote DEP-02 (dependencias puntuales)

- Actualizacion de mantenimiento, sin cambios de comportamiento ni de API en los consumidores: `@supabase/supabase-js` 2.115.0 -> 2.116.0 (manifiesto `^2.116.0`), `typescript-eslint` 8.69.0 -> 8.70.0 (manifiesto `^8.70.0`) y `@types/node` 22.20.1 -> 24.13.3 (manifiesto `^24.13.3`, alineado con Node 24 de `.nvmrc`/CI).
- Transitivas movidas por exigencia de esos paquetes: `@supabase/auth-js`, `@supabase/functions-js`, `@supabase/postgrest-js`, `@supabase/realtime-js` y `@supabase/storage-js` a 2.116.0; familia `@typescript-eslint/*` (eslint-plugin, parser, project-service, tsconfig-utils, type-utils, typescript-estree, visitor-keys) a 8.70.0; `undici-types` a 7.18.2 requerido por `@types/node` 24.
- Sin cambios en TypeScript 5.9.3, ESLint 9, Bun, Vite/Rolldown, Start/Router, Nitro, Vitest, Tailwind ni configuracion de Lovable. Sin nuevas funciones de backend, sin regenerar tipos de BD y sin cambios de cliente/sesion.
- Validacion puntual en Lovable: `tsc --noEmit` limpio, lint sin errores (14 avisos preexistentes) y 32 pruebas focalizadas de sesion, transporte autenticado y barrera de red verdes (todas con mocks, sin backend real). Suite completa y cobertura quedan a cargo de GitHub Actions.

## [8.1.8] - 2026-09-09

### Permisos de facturación recurrente

- El interruptor «Facturación recurrente» del detalle de reserva ahora también está disponible para quien tiene acceso completo al módulo Facturas (rol administrativo), además de quien tiene acceso completo a Reservas. La recurrencia es una decisión de facturación y el backend ya permitía la operación a ese rol. Sin cambios en RLS, reglas de negocio ni en los estados cerrados (cancelada/completada siguen bloqueando el cambio). Pruebas: `src/features/bookings/components/booking-detail/__tests__/BookingBillingCard.test.tsx`.

## [8.1.7] - 2026-09-09

### Mantenimiento YAGNI — lote DEP-01 (dependencias puntuales)

- Actualización mínima de tres librerías sin cambios de comportamiento: `dompurify` 3.4.14 → 3.4.15 (parche de sanitización, versión exacta), `marked` 18.0.11 → 18.0.12 (manifiesto `^18.0.12`) y `@tanstack/react-virtual` 3.14.10 → 3.14.11 (manifiesto `^3.14.11`). Dependencia transitiva: `@tanstack/virtual-core` 3.17.8 → 3.17.9 (parche requerido por react-virtual 3.14.11). Sin cambios de API en los consumidores (`VirtualBody`, manual de ayuda Markdown). Pruebas focalizadas: sanitización/renderizado Markdown (13) y tabla virtual (14) verdes.

## [8.1.6] - 2026-09-09

### Corrección puntual V27-02 (regresión de zona horaria)

- La etiqueta «Cartera vencida al día de hoy» en Reportes → Antigüedad de Cartera usaba `formatDateMty(nowMty())`. `nowMty()` ya aplica `toZonedTime(…, America/Monterrey)` y `formatDateMty`, al recibir un instante, volvía a aplicarlo; en navegadores con TZ distinta a Monterrey mostraba el día anterior. Se cambusa a `formatDateMty(toYMD(nowMty()))` (date-only), que evita la doble conversión y muestra siempre la fecha actual de Monterrey, también de madrugada. No cambia `nowMty` ni `formatDateMty` globalmente. Regresión: `src/features/reports/lib/__tests__/agingCuttoffLabel.test.ts` (reloj fijo 2026-09-09T07:00:00Z bajo TZ=UTC).

## [8.1.5] - 2026-09-09

### Correcciones V27 (presentación y accesibilidad, sin reglas de negocio)

- V27-01 Ingresos: el detalle mensual, su contador y su exportación se recortan al rango activo del reporte (límites inclusivos por día calendario, sin desplazamientos UTC) mediante `invoicesWithinRange` en `src/features/reports/lib/drilldown.ts`. No cambia SQL/RPC ni las reglas de importes, pagos o notas de crédito. Regresión: `src/features/reports/lib/__tests__/invoicesWithinRange.test.ts`.
- V27-02 Antigüedad de Cartera: se oculta el selector de rango que el reporte nunca usaba y se muestra «Cartera vencida al día de hoy (fecha)». Los demás reportes conservan su rango al volver a ellos.
- V27-03 Menú lateral móvil: los enlaces de `SidebarNavSection` cierran el panel móvil al navegar (sólo con clic normal; Ctrl/Cmd/Shift/Alt o botón no primario lo respetan). Escritorio, prefetch y grupos recordados sin cambios.
- V27-04 Tarjetas de reservas: cada tarjeta móvil es un `Link` real con nombre accesible «Reserva NÚMERO» y foco visible; Tab/Enter y el tap siguen abriendo el detalle correcto.
- V27-05 `CurrencyField`: `FormControl` envuelve directamente el `Input`, de modo que la etiqueta, la descripción y el error quedan asociados al campo (por ejemplo «Costo» en Mantenimiento). Parseo, formato y estado de RHF intactos. Regresión: `src/components/forms/fields/__tests__/CurrencyField.a11y.test.tsx`.

## [8.1.4] - 2026-09-08

### Calidad interna (sin cambios funcionales)

- `router-compat` se separa en tres módulos: `src/lib/router-compat-url.ts` (parseo de URLs), `src/lib/router-compat-ui.tsx` (`Link`, `Navigate`, `Outlet`) y `src/lib/router-compat.ts` (hooks). Se actualizaron ~60 importaciones; API y comportamiento idénticos.
- `createAppQueryClient` se mueve a `src/lib/query/appQueryClient.ts`; `AppProviders.tsx` exporta sólo el componente.
- Complejidad reducida sin alterar reglas ni mensajes: `invoiceFormSchema` divide su `superRefine` en validaciones por tema; `customerPortal.functions.ts` extrae validación, alta de usuario, enlazado con limpieza y generación del enlace (pasos secuenciales, mismo orden y mismos errores); `feedbackAi.functions.ts` extrae la construcción del prompt y del payload de actualización; `AuthPage` extrae encabezado y enlaces secundarios; `CustomerSelector` extrae combobox y captura manual.
- La prueba `useUnsavedChangesGuardBlocker` deja de asignar una variable externa durante el render (se registra en un efecto), conservando todas sus aserciones.

## [8.1.3] - 2026-09-08

### Corrección visual puntual V26-03

- El rango «Fecha de emisión» apila inicio y fin únicamente en móvil y reserva una columna fija para el calendario; el contenedor del filtro puede encogerse junto al botón de quitar filtro. Las fechas completas DD/MM/AAAA quedan legibles a 320 px sin recortar texto ni ocultar desbordamiento, mientras que desde 640 px se conserva la distribución horizontal.

## [8.1.2] - 2026-09-08

### Auditoría visual V26 (presentación y accesibilidad, sin reglas de negocio)

- V26-01 `DataTablePaginationV2` / `TablePagination`: el pie apila selector+rango sobre la navegación en móvil (`sm:` vuelve a una fila) y sustituye la numeración por «N de M»; Anterior/Siguiente conservan handlers y estados. Regresión: `src/components/feedback/__tests__/TablePagination.test.tsx`.
- V26-02 `SidebarNavSection`: el disparador de grupo es un `<button type="button">` real vía `SidebarGroupLabel asChild` (Tab, Enter/Espacio, foco visible), sin listeners manuales ni botones anidados; estilo y estado recordado intactos.
- V26-03 `InvoicesToolbar` / `DateRangePickerField`: etiqueta visible «Fecha de emisión», ancho `sm:w-80` y nombres accesibles completos («Fecha de emisión — inicio/fin», «Abrir calendario de Fecha de emisión»); con `label` vacío se usa «Rango de fechas» y no se renderiza `<Label>` vacío.
- V26-04 `SearchBar`: `type="search"` y `aria-label` (por defecto el placeholder contextual del módulo, sobreescribible); placeholder, debounce, limpieza y atajo sin cambios. Regresión: `src/components/forms/__tests__/SearchBar.test.tsx`.
- V26-05 `DateRangePickerField`: el diálogo pasa de `min-w-[22rem]` a `min-w-[min(22rem,calc(100vw-2rem))]` con `max-w-[calc(100vw-2rem)]`, padding responsive y footer que envuelve; dos meses en escritorio, uno en móvil.
- V26-06 `KpiTile`: `h-full` en enlace/botón y tarjeta, contenido alineado arriba y altura reservada de 2 líneas en la etiqueta: todas las tarjetas de la fila miden lo mismo sin truncar importes ni títulos.
- V26-07 `QuoteTypeCard`, `CustomerSelector` (nueva prop `compact`, usada sólo desde `CustomerField`) y `QuoteForm` (`space-y-4`): se retiran encabezados redundantes y se reduce el padding; orden, validaciones, controles táctiles y ayuda se conservan.
- V26-08 `QuoteDetailActions`: en convertidas se elimina la CTA deshabilitada «Ya convertida a Reserva» (redundante con el badge), «Ver reserva» pasa a acción principal y Eliminar baja de énfasis manteniendo `RoleGuard` y confirmación; sin reserva ligada queda el aviso de estado en texto.

## [8.1.1] - 2026-09-08

### Correcciones (auditoría ronda 2)

- TS-05 (accesibilidad del menú): `NavLink` ahora pasa `activeOptions={{ exact, includeSearch: false }}` al enlace de TanStack, de modo que el estado activo nativo (`aria-current="page"`) coincide con el resaltado visual. En `/invoices/reconciliation` sólo «Conciliación CFDI» queda como página actual; las listas con filtros y los detalles siguen activando su sección. Regresión con router real en `src/layouts/__tests__/NavLinkActive.test.tsx`.
- AUTH-REC-01 (recuperación de contraseña): nuevo estado explícito del flujo (`src/features/auth/recoverySession.ts`) detectado en arranque en frío antes de que el SDK limpie el fragmento y confirmado ÚNICAMENTE por el evento `PASSWORD_RECOVERY`, capturado temprano en `src/features/auth/recoveryCapture.ts` (sin tokens persistidos, sin logs, sin red ni llamadas al SDK dentro del callback). Una sesión previa de otra persona ya no confirma la recuperación (auth-js 2.115.0 la conserva cuando el enlace falla), y un enlace incompleto/inválido termina en error con un límite de espera, nunca en `pending` infinito ni en autorización. `AuthGuard` mantiene `AuthPage` mientras el flujo esté activo y se añade la ruta pública `/auth`, destino de los enlaces de restablecimiento e invitación. Los enlaces expirados estándar sin `type` (`error_code=otp_expired`) ya se reconocen. Tras cambiar la contraseña o iniciar sesión en `/auth` se navega al destino normal (el guard decide interno/portal); cancelar sólo cierra la sesión cuando es la de recuperación, y «Solicitar un enlace nuevo» abre el formulario de correo. P1b: el flujo activo guarda en memoria SÓLO el id del usuario validado; si el SDK cierra sesión o cambia de cuenta (otra pestaña) la recuperación se invalida y el formulario deja de poder actualizar o cerrar esa sesión ajena, mientras que un refresco de token del mismo usuario la conserva. Un único listener (`recoveryCapture`) gobierna el estado con identidad; se retiran las reactivaciones sin identidad de `AuthContext` y de `AuthPage`. Sin cambios de guards, RLS ni reglas de negocio; no se registran ni se propagan tokens.

## [8.1.0] - 2026-09-08

### Seguridad de pruebas (producción protegida)

- Nuevo guard fail-closed `tests/e2e/fixtures/productionGuard.ts`: lista negra del ref productivo, exigencia de `E2E_ISOLATED_BACKEND=1`, destino obligatorio y host local/efímero (escape remoto explícito y aun así sujeto a la lista negra). Comprueba variables de cliente (VITE__) y de servidor (SUPABASE__).
- Invocado antes de login, de `ensureE2eSeedEnabled`, del seeding y del teardown (`purge_e2e_data`), y en `supabaseEnv()` como chokepoint único.
- CI: el job `e2e` deja de recibir secretos productivos, exige `E2E_SUPABASE_URL` aislado y verifica que `dist/client` no fue compilado contra producción; sin precondición el job falla explícitamente (no se silencian tests).
- Los suites SQL ya usaban Postgres local efímero (127.0.0.1:54322) con rollback: sin cambios.

## [8.0.0] - 2026-09-08

### Mayor (migración de framework)

- Migración completa del stack Classic (Vite + React Router) a TanStack Start con SSR. 62 rutas convertidas a archivos TanStack Router; guards de acceso (AuthGuard, RoleGuard, AdminRouteGuard) preservados y verificados mecánicamente uno a uno (56 entradas de cobertura).
- Alias históricos (/expenses, /accounts-payable, /payments, /prospects, /availability, /cash-flow, /conciliacion, /bank-reconciliation, /customers/new) y /login siguen redirigiendo igual; portal de clientes con sus 11 vistas y login en /portal/login.
- Compat layer `src/lib/router-compat.tsx` (useNavigate, useLocation, useParams, useSearchParams, useBlocker, useNavigationType, Link, Navigate, Outlet) — las pantallas no cambian de comportamiento.
- Metadatos SEO, favicon, fuentes, Sentry, shim Intl.Locale y recarga por chunks stale portados a `src/routes/__root.tsx`; tema Tailwind conservado (147 tokens/utilities re-aplicados).
- Los 23 servicios backend (Edge Functions) permanecen en su lugar sin cambio de URL: 4 cron, clúster fiscal CFDI compartido, 2 con dependencias Deno y 7 internos candidatos a migrar después.
- Fix: `OfflineBanner` asumía `navigator.onLine` en el servidor y causaba mismatch de hidratación; ahora sincroniza tras hidratar.
- Gates verificados: build limpio, `tsc --noEmit` 0 errores, 62/62 rutas responden 200 en SSR, sin errores de runtime tras hidratación.

## [7.423.3] - 2026-09-08

### Corrección (timbrado de complemento de pago)

- REP: la razón social del receptor se normaliza con `sanitizeLegalName` (mayúsculas, sin acentos, sin régimen societario), igual que en `stamp-cfdi` y `stamp-credit-note`. Corrige el rechazo del SAT CFDI40145 "El campo Nombre del receptor debe pertenecer al nombre asociado al RFC".
- Receptor global (XAXX010101000) timbra como "PUBLICO EN GENERAL"; se elimina el fallback a "Público General" para receptores con RFC real.
- Fail-fast (400) en español si falta la razón social del receptor, liberando el claim para reintentar tras corregir el cliente.
- El 502 del PAC ahora devuelve el mensaje real del SAT en vez de "Facturapi error: 400". Sin cambios de reglas de negocio, RLS, importes ni datos.

## [7.423.2] - 2026-09-07

### Corrección (auditoría externa verificada)

- Invitación al portal: si el correo ya pertenece a otra cuenta, la edge function `invite-customer` responde 409 "Ya existe un usuario con ese correo" y la pantalla muestra el motivo real en español, en vez de un error genérico.
- Verificación de la auditoría externa (9 hallazgos): 6 no existen en el código actual (`v_supplier_bills`, `pickupHorometerSchema.ts`, policy "public access" en facturas, tolerancia bancaria ya presente, limpieza de caché al cerrar sesión ya presente, periodos recurrentes ya calculados en America/Monterrey en el servidor). Sin cambios de reglas de negocio, RLS, importes ni datos. No publicado.

## [7.423.1] - 2026-09-07

### Corrección (Bug 3 endurecido en base de datos)

- Entregas: la justificación para completar sin operador ni firma ya no depende sólo de la pantalla; un trigger de base de datos (`trg_delivery_completed_evidence`) exige `completed_no_evidence_reason` con contenido al dar de alta una entrega ya completada o al pasarla a completada cuando `driver_name` y `signature_base64` están vacíos (espacios en blanco no cuentan).
- Históricos intactos: la regla sólo se evalúa en el alta o en la transición a completada; las entregas que ya estaban completadas sin evidencia (ENT-0027 y compañía) siguen siendo editables y no se modificó ningún dato.
- Pruebas: nuevo smoke SQL `r_fix41_delivery_evidence_smoke.sql` (firma, operador, razón, rechazo en alta y en transición, histórico editable) y ajuste mínimo del fixture de `fix03_m7_m8_l2_smoke.sql` (sus entregas de prueba ahora llevan operador). Sin cambios de RLS, permisos ni máquinas de estado. No publicado.

## [7.423.0] - 2026-09-03

### Corrección (regresión v7.422.0 — atomicidad y coherencia de facturas agrupadas)

- Facturas: crear o editar una factura con sus reservas ahora ocurre en UNA sola transacción de base de datos (RPC `save_invoice_with_bookings`); un fallo al ligar cualquier reserva revierte todo — ya no pueden quedar facturas parciales o huérfanas.
- Concurrencia: candados advisory por reserva (misma clave md5/60-bits y orden ascendente que la facturación recurrente) adquiridos ANTES del chequeo de duplicados; dos intentos simultáneos con la misma reserva+período (incluida como secundaria) dejan exactamente una factura y el perdedor recibe un error claro sin persistir nada. Verificado con 4 POST simultáneos y carrera de reserva secundaria contra la base real.
- Multi-selección: sólo se pueden agrupar reservas del mismo cliente, misma moneda/tipo de cambio y exactamente el mismo periodo facturable canónico; las incompatibles se deshabilitan con la razón ("moneda distinta", "periodo facturable distinto", etc.) y la misma regla se valida al guardar (cliente y servidor). Sin conversión automática de monedas.
- Periodo: `billingPeriodEnd` obligatorio con reserva, inicio ≤ fin, y el periodo debe caber en el rango de TODAS las reservas seleccionadas — validado en el formulario y de nuevo dentro del RPC transaccional; se eliminó el fallback silencioso a un mes ajeno a la reserva.
- Bloqueo optimista intacto: `expectedVersion`/`stale_write` se conserva y un guardado fallido ya no consume la versión (el reintento usa la misma sin falso conflicto).
- Datos históricos intactos: FAC-0113 (hash y versión verificados), reservas legadas por `booking_id` directo y regla canónica de facturas canceladas sin cambios.

## [7.422.0] - 2026-09-03

### Corrección (9 bugs de auditoría)

- Entregas: `completed_at` lo sella el servidor en toda transición a completada (trigger en DB); el navegador ya no envía fecha, eliminando completadas sin fecha o con fecha anterior a la creación. Históricos ENT-0027/0028/0029/0031/0032/0033 intactos.
- Entregas: completar sin operador ni firma exige una justificación breve (nuevo campo `completed_no_evidence_reason`) en detalle, alta histórica y registro post-reserva.
- Facturas: el período inicial prellenado siempre se acota a las fechas de la reserva; una recurrente que termina dentro de su mes inicial ya no hereda el mes de emisión.
- Facturas agrupadas: la sincronización de reservas es atómica en DB (RPC `sync_invoice_bookings`) con bloqueo de duplicados por reserva+período contra facturas no canceladas (incluye `booking_id` legado).
- Panel: los KPIs financieros distinguen carga (skeleton), error ("No disponible" + reintentar) y cero real; se acabaron los $0 falsos.
- Navegación: "Búsqueda global" ahora es "Navegación rápida" con placeholder "Ir a…" (Ctrl+K se conserva).
- Cotizaciones: pestañas en plural (Todas, Borradores, Enviadas, Aceptadas, Convertidas, Rechazadas, Expiradas, Canceladas); badges siguen en singular.
- Cuentas bancarias: botones de editar/eliminar con aria-label contextual, tooltip y tamaño de icono consistente.

## [7.421.3] - 2026-09-03

### Corrección

- Facturas: la lista ya no descarga todo el historial en cadena al abrirla o filtrar; sólo pide la siguiente página del servidor cuando el usuario llega a la última página ya cargada.

## [7.421.2] - 2026-09-03

### Corrección

- Contratos: el candado de "un contrato vigente por reserva" ahora vive en la base de datos (trigger transaccional) y valida contra todos los contratos, sin importar su fecha; el índice con corte por fecha dejaba pasar un contrato nuevo frente a duplicados históricos.
- Bloquea también mover un contrato a una reserva ocupada y reactivar uno cancelado si duplicaría; cancelar sigue permitido (incluso varios cancelados por reserva).
- Seguro ante concurrencia y clientes externos; los históricos CTR-0002/CTR-0003 permanecen intactos y la UI conserva su aviso "Ya existe un contrato para esta reserva".

## [7.421.1] - 2026-09-03

### Corrección (10 hallazgos confirmados)

- Panel: alerta de seguros sin equipos de prueba (E2E); refleja la flota real.
- Facturas: una sola paginación por páginas (sin "Mostrando…" ni "Cargar más").
- Inicio de sesión: el error de un intento fallido se descarta al reintentar o al entrar con éxito.
- KPIs: títulos largos con wrap de dos líneas en vez de truncarse.
- Entregas: badge "Atrasada" derivado con fecha local (sin desfase UTC).
- Contratos: candado de un contrato vigente por reserva (aviso claro + índice único; históricos intactos).
- Bitácora: identidad "Sistema" única y campos técnicos traducidos al español.
- Devoluciones: el inspector se registra automáticamente con el usuario autenticado (solo admin puede cambiarlo).
- Estado de resultados: "Egresos antes de depreciación" + tarjeta "Depreciación total".

## [7.421.0] - 2026-09-03

### Función

- Invitación al portal: enlace de acceso + mensaje en español con contexto del portal, listos para copiar y compartir.

## [7.420.5] - 2026-09-03

### Corrección

- Invitación al portal: ahora sí se envía el correo de acceso (antes sólo se generaba el enlace sin enviarlo).

## [7.420.4] - 2026-09-03

### Corrección

- Invitar al portal: el rol administrativo ya puede crear accesos de cliente (antes sólo admin), y los errores muestran el motivo real en español.

## [7.420.3] - 2026-09-02

### Corrección

- Pagos a proveedores: cada pago se liga al lote vigente de su factura (si existe), evitando cancelar un lote ya pagado y volver a exportarlo.
- Timbrado automático: la cola de reintentos y la reconciliación tienen presupuesto de tiempo por corrida y lotes más chicos; sus crons se escalonan para no encimarse.

## [7.420.0] - 2026-09-02

### Corrección (auditoría ronda 3)

- Complemento de pago: el IVA se desglosa por partida de la factura original (exentas, tasa 0 y tasas mixtas) en vez de una sola tasa de encabezado.
- Complemento de pago: un REP cancelado que falla al re-timbrarse vuelve a estado cancelado y puede reintentarse.
- Saldo anterior del complemento: un pago con complemento cancelado ya no reduce el saldo declarado.
- Pagos a proveedores: la liga pago-lote es explícita; un abono manual ya no bloquea la cancelación del lote.
- Clientes: la edición guarda la tasa de IVA del cliente.
- Facturación recurrente: los extras se consideran cobrados sólo si hay factura vigente con esas partidas, incluyendo las ligadas directo a la reserva.
- Moneda extranjera: cotizaciones y vista previa recurrente exigen tipo de cambio real (no 0 ni 1).
- Exportación de facturas a CSV con columnas Moneda y Tipo de cambio.

## [7.419.0] - 2026-09-02

### Corrección (auditoría ronda 2)

- Notas de crédito: el máximo acreditable convierte los pagos con complemento vigente a la moneda de la factura; sin tipo de cambio se bloquea la emisión con explicación.
- Complemento de pago: saldo anterior con todos los pagos válidos y parcialidad contada sólo con complementos vigentes.
- Pagos a proveedores: cada pago se liga al lote vigente de su factura; cancelar un lote ya no se bloquea por abonos ajenos previos.
- Flujo de efectivo: las rentas recurrentes se proyectan con IVA del cliente (16% por omisión, 0% si está configurado así).
- Facturación recurrente: seguro y logística de la cotización se cobran una sola vez, en la primera factura de la reserva.
- Mantenimiento: no se puede programar un servicio que se traslapa con reservas confirmadas (con días de colchón).

## [7.418.2] - 2026-09-02

### Corrección (pruebas)

- Las 9 pruebas de documentos PDF fallaban tras la actualización de jsdom 30: el mock de react-pdf pasaba estilos como arreglo al DOM y jsdom lo rechaza. El mock ahora aplana los arreglos de estilos antes de renderizar; sin cambios en producción.

## [7.418.1] - 2026-09-02

### Corrección (guardrail de arquitectura)

- El chequeo arch-check ya reconoce `src/lib/domain/bookingRates.ts` como archivo legítimo: lo usan reservas y facturas, y moverlo a un solo feature violaría la regla de imports cruzados (G5).
- Se documentó la excepción en el README de `lib/domain`.

## [7.418.0] - 2026-09-02

### Corrección (auditoría fixes_lovable: facturación y datos fiscales)

- Un periodo recurrente cuya factura fue cancelada vuelve a poder facturarse: el índice único ya sólo considera facturas vigentes.
- Las tarifas de la factura manual y las de una extensión usan la misma regla: la tarifa pactada manda sólo si es mayor a cero; en cero o vacía se usa la del catálogo.
- El cliente ahora tiene campo de tasa de IVA (por ejemplo 8% en frontera) y la factura la toma automáticamente al elegirlo.
- Los cargos extra de seguro y logística ya no se vuelven a precargar si la reserva ya los tiene facturados, evitando doble cobro.
- La edición de cotizaciones congela la versión al abrir el formulario, de modo que el candado contra cambios simultáneos vuelve a ser efectivo.
- Una factura en moneda extranjera ya no acepta tipo de cambio 1.00: se exige el tipo de cambio real para que los indicadores no se distorsionen.

## [7.417.2] - 2026-09-02

### Mantenimiento (actualización de dependencias)

- Se actualizaron dompurify (3.4.14), react-dropzone (20.1.1), jsdom (30.0.1), @types/node (26.4.1) y eslint-plugin-react-refresh (0.5.5) sin cambios de comportamiento.
- react-table permanece en v8: la v9 cambia la API por completo y exigiría migrar el DataTable; se evaluará como proyecto aparte.
- TypeScript permanece en 5.x hasta que typescript-eslint soporte la v7.

## [7.417.1] - 2026-09-02

### Corrección (estabilidad de CI y conciliación)

- La conciliación bancaria dejó de consultar una columna inexistente en pagos a proveedores; conserva la exclusión de pagos de clientes marcados como pruebas.
- Las pruebas del asistente recurrente ahora reflejan correctamente que nada inicia preseleccionado.
- Vitest y su cobertura quedaron en la misma versión, y la configuración ya no depende de `__dirname`.
- Se resolvieron los avisos de imports, complejidad y tamaño reportados por ESLint sin cambiar comportamiento.

## [7.417.0] - 2026-09-02

### Corrección (remediación integral R10)

- Indicadores financieros, MRR y rentabilidad por montacargas usan la regla canónica de tipo de cambio; los equipos archivados permanecen en la depreciación histórica hasta su fecha de baja.
- La conciliación bancaria excluye datos E2E y `fx_is_missing` queda restringida a roles autenticados y de servicio.
- Las reservas no recurrentes se precargan completas al facturar manualmente; las recurrentes conservan su primer periodo prorrateado.
- El proceso recurrente informa cuando alcanza el límite de 24 periodos y cuántos quedan pendientes, sin generar periodos adicionales.
- Eliminar y cancelar reservas evita dobles envíos; el diálogo de cancelación sólo cierra cuando la operación termina correctamente.
- Los totales y CSV de mantenimiento respetan filtros; la exportación de facturas consulta hasta 10,000 filas con los filtros activos.
- Desactivar recurrencia requiere confirmación explícita. Los smoke tests SQL ahora fallan de verdad ante una regresión.

## [7.416.0] - 2026-09-02

### Mejora (optimización móvil, fase 2)

- `src/lib/charts/useChartSizing.ts` (nuevo): medidas de gráficas dependientes del ancho (tick, eje X rotado, ancho de eje Y, alto del área, truncado de etiquetas).
- Reportes adaptados: Utilización de Flota, Ingresos por Mes, Costos de Mantenimiento, Utilización por Modelo y Rentabilidad por Modelo.
- Fichas de detalle (Reserva, Cliente, Montacarga, Proveedor, Entrega, Devolución): `md:grid-cols-2` → `sm:grid-cols-2` y `gap-4 sm:gap-6`, para dos columnas desde 640 px.
- Sin cambios de backend, reglas de negocio, RLS ni permisos.

## [7.415.3] - 2026-09-02

### Fix (auditoría móvil en celular plegable 692×764)

- Auditoría visual con navegador real a 692×764 en Panel, Reservas, Clientes, Facturas, Flota, Mantenimiento, Cotizaciones y Reportes: sin desbordamiento horizontal, cajón del menú lateral y tarjetas móviles correctos.
- `FormDialog.tsx`: el `p-6` del contenedor scrollable impedía que el footer sticky llegara al borde; quedaban ~25 px de formulario asomando bajo los botones. Ahora `pb-0` en el scrollport, `pb-6` en el cuerpo y `-mb-6` en el footer.
- `FormDialogFooter`: padding inferior con `env(safe-area-inset-bottom)` para la barra de gestos del teléfono.
- Sin cambios de backend, reglas de negocio, RLS ni permisos.

## [7.415.2] - 2026-09-01

### Fix (pulido visual: sidebar colapsado y modales)

- Auditoría visual con navegador sobre sidebar y modales.
- `SidebarBranding.tsx`: en modo icono (riel de 3rem) el recuadro del logo (h-12, max-w-10rem) se desbordaba y quedaba cortado; ahora encoge a 8×8 con padding reducido.
- `SidebarUserFooter.tsx`: correo, rol y número de versión se salían del riel al colapsar; ahora se ocultan y los botones (tema, contraseña, salir) se apilan verticalmente centrados.
- `FormDialog.tsx`: el `pb-20` del cuerpo scrollable dejaba ~5rem de hueco muerto debajo del footer sticky en todos los modales de formulario. Eliminado (el footer ya es el último hijo del scroll, no hay solapamiento).
- `dialog.tsx`: el botón de cerrar usa `CloseIcon` del registro en vez de importar `X` por el wildcard de lucide.
- Sin cambios de backend, reglas de negocio, RLS ni permisos.

## [7.415.1] - 2026-09-01

### Patch (UX: wizard recurrente sin preselección)

- Reporte de usuario: al abrir la vista previa de facturas recurrentes, algunas líneas venían preseleccionadas. Era por diseño ("fila nueva y seleccionable se marca por defecto"), pero el equipo prefiere selección explícita.
- Cambio (solo frontend, `src/features/invoices/lib/recurringSelection.ts`): `resolveId()` ya no devuelve `"selected"` para filas nuevas; la selección inicia vacía (fail-closed) y sólo el toggle del operador agrega filas. Activar la confirmación de tarifa modificada habilita las líneas con `rateWarning` pero ya no las marca solas.
- Protecciones intactas: lo desmarcado no resucita con refrescos (R8-12), cambio de monto/periodo exige re-aprobación (R8-05), la intención sobrevive a ausencias temporales (R9-01) y la selección es por reserva + periodo (R9-18).
- Texto del diálogo: "Desmarca las que quieras excluir" → "Marca las que quieras incluir".
- Sin cambios en backend, elegibilidad, prorrateo ni en la Edge Function. Tests: `recurringSelection.test.ts` actualizado (19/19 ok).

## [7.414.3] - 2026-09-01

### Fix (UX: eliminar reserva confirmada terminaba en reporte de error)

- Error reportado: admin intentaba eliminar una reserva `confirmed` y recibía `DB_PERMISSION_DENIED` con el mensaje crudo de la RPC `delete_booking` ("Solo se pueden eliminar reservas canceladas o completadas").
- Causa: `BookingActions.tsx` mostraba el botón **Eliminar** habilitado para reservas confirmadas, acción que siempre falla en el servidor.
- Corrección (solo frontend): el botón usa `BlockedActionButton` y queda bloqueado con tooltip explicativo cuando la reserva está confirmada ("Primero usa Cancelar y después podrás eliminarla"); en `cancelled`/`completed` funciona como antes. Nuevo código de bloqueo `booking_not_final_for_delete` en `businessBlocks.ts` con patrón de error mapeado.
- Backend intacto: `delete_booking`, triggers, RLS y máquina de estados sin cambios. Tests nuevos en `bookingDeleteGuard.test.ts`.

## [7.414.2] - 2026-09-01

### Fix (hotfix: ficha de cliente no cargaba)

- Error reportado en producción: `/customers/:id` mostraba "No se pudo cargar la información" con `42702 column reference "fx_missing" is ambiguous`.
- Causa: la CTE `scoped` de `public.get_customer_summary` hacía `SELECT v.*` sobre `v_invoices_with_balance` (que ya expone `fx_missing`) y además agregaba un alias calculado con el mismo nombre.
- Corrección (solo SQL, `CREATE OR REPLACE`): se elimina el alias redundante; la función usa la columna `fx_missing` de la vista (misma regla canónica `fx_is_missing`). El JSON de salida es idéntico.
- Sin cambios en RLS, permisos, reglas de negocio ni en la vista. Warnings del security linter posteriores a la migración son preexistentes del proyecto.

## [7.414.1] - 2026-09-01

### Fix (primer ciclo: días al precio diario)

- `prorateMonthlyLine()` (`src/lib/domain/firstBillingPeriod.ts`): devuelve `quantity = días facturados`, `unitPrice = renta mensual / días del mes` (6 decimales, CFDI 4.0) y `total = round2(qty × precio)`. Reemplaza a `prorateMonthlyAmount()` (eliminado, sin otros consumidores).
- `buildLinesForBooking`: la partida del primer ciclo ya no es `1 × importe prorrateado`; ahora es `N días × precio diario` con descripción `Renta <mes año> (N días al precio diario)` y `clave_unidad: DAY`.
- Sin cambios en el motor recurrente, esquema, RLS, RPC, permisos ni reglas fiscales.
- Pruebas actualizadas en `firstBillingPeriod.test.ts` y `useInvoiceFormHandlers.test.ts` (28/30/31 días e inicio día 1).

## [7.414.0] - 2026-09-01

### Feature (primer ciclo prorrateado en facturas desde reserva)

- `src/lib/domain/firstBillingPeriod.ts` (nuevo): `firstBillingPeriod(start,end)` recorta el primer periodo al fin del mes de inicio cuando la reserva se extiende más allá, y `prorateMonthlyAmount()` replica la fórmula en centavos de `generate-recurring-invoices/prorate.ts`.
- `buildLinesForBooking` (`useInvoiceFormHandlers.ts`): reserva de largo plazo que inicia a mitad de mes ⇒ una sola partida `Renta mensual (prorrateo N días)` con `quantity: 1` (invariante timbrable `total = qty × precio`); inicio el día 1 ⇒ `generateLineItems` sobre el rango recortado (mes completo). Rentas dentro del mismo mes: sin cambios.
- `handleBookingsChange` precarga `billingPeriodStart/End` con el periodo recortado cuando aplica; si no, conserva el mes de emisión (H-6).
- Sin cambios en el edge function recurrente, esquema, RLS, RPC, permisos ni reglas fiscales.
- Pruebas: `src/lib/domain/__tests__/firstBillingPeriod.test.ts` (7) y 3 casos nuevos en `useInvoiceFormHandlers.test.ts`.

## [7.413.0] - 2026-09-01

### Fix (cierre R9 · recurrentes, REP y reportes)

- R9-18 fail-closed: `supabase/functions/generate-recurring-invoices/selection.ts` filtra exclusivamente por `selections` (vacío/inválido ⇒ 0) o, si `selections` no vino, exclusivamente por `bookingIds` (vacío ⇒ 0). Sin ningún selector devuelve `null` y `index.ts` responde 400 "Se requiere una selección explícita" sin escribir. El cron mutante sigue siendo no-op.
- R9-17: la recuperación de mantenimiento reporta `pendingRemaining` tras el tope de 12 meses y el cursor sólo avanza hasta lo realmente creado.
- R9-02 (REP): `resolveRepExchange` es la única decisión compartida por `validateRelatedInvoiceExchange` y `computeRepExchange`. Misma moneda ⇒ 1; factura extranjera + pago MXN ⇒ TC de la factura (finito, > 0, != 1); factura MXN + pago extranjero ⇒ TC del pago; dos extranjeras distintas ⇒ falla cerrada antes del PAC. `index.ts` pasa `payment.exchange_rate`.
- Reporte mensual: `report_revenue_by_month` no reinterpreta la moneda del pago con la de la factura. Estado de cuenta: `get_customer_summary` advierte también pagos sin conversión válida.
- Pruebas: `selection_test.ts` cubre selección vacía, inválida, inexistente, legacy y sin selector; `decisions_test.ts` cubre la matriz de monedas del REP; `supabase/tests/r9_payment_fx_smoke.sql` ahora usa `ON_ERROR_STOP on` y `RAISE EXCEPTION` (mantiene BEGIN/ROLLBACK) y agrega una prueba semántica de `get_customer_summary`.
- R9-12: la aplicabilidad de 629/630 se documenta contra el catálogo oficial del SAT descargado de omawww.sat.gob.mx (`catCFDI_V_33_23032023.xls`, hoja `c_RegimenFiscal`: Física="Sí", Moral="No", vigencia 01-01-2024). Sin cambios de aplicabilidad.
- YAGNI: se elimina `roadmap.md`.

## [7.412.0] - 2026-09-01

### Fix (facturación recurrente manual)

- Se desprogramó el cron `generate-recurring-invoices-daily` (migración con `cron.unschedule`): los borradores de renta mensual ya no se crean solos, porque agrupar/separar reservas en una factura es decisión del operador.
- `supabase/functions/generate-recurring-invoices/index.ts`: si la llamada viene autenticada como cron y no es `preview`, la función responde `skipped: "automatic_generation_disabled"` sin escribir nada (fail-safe si el job se reagenda por error).
- Vista previa: cuando el siguiente periodo aún no empieza y el mes EN CURSO ya está facturado, se agrega una línea `already_invoiced` con el número y la liga de la factura existente, además de la línea `period_in_future`.
- `RecurringPreviewBody.tsx`: nuevo aviso "El periodo en curso ya está facturado" cuando no hay líneas elegibles.
- Sin cambios en prorrateo, FX, IVA, `allowStaleRate`, agrupación ni en el RPC `create_recurring_invoice`.

## [7.411.1] - 2026-09-01

### Refactor (YAGNI · verificaciones R9)

- `supabase/tests/r9_fx_canonical_guard.sql`: se elimina el bloque 2 (escaneo global de deriva FX sobre todas las funciones y vistas de `public` buscando `tipo_cambio > 0` / `COALESCE(..., 1)`). Era un lint arquitectónico sin caso confirmado; se conservan las aserciones directas sobre los consumidores migrados, la matriz de `fx_to_mxn`/`fx_convert_amount` y los checks de las vistas.
- `supabase/tests/r9_lote_ac_smoke.sql`: se elimina el conteo espejo de utilización (dos consultas idénticas comparadas entre sí, imposible de fallar). La paridad se afirma sobre el fuente de `report_utilization_by_unit` y `report_utilization_by_model`.
- Decisión documentada: la ronda R9 no introduce tablas, colas, estados, overrides ni sistemas de reparación nuevos. Las señales de R9-05 son mensajes dentro del `details[]` que el cron ya devolvía. Los helpers `fx_to_mxn`, `fx_convert_amount` y `bank_amount_in_account_currency` se conservan porque tienen consumidores reales (vistas y RPC de bancos), no como capa especulativa.
- Fuera de alcance por indicación explícita: R9-15, R9-17 (se mantiene el límite de 12 meses), R9-18, R9-19, R9-20 y R9-22.
- Sin cambios de comportamiento, UI, esquema ni permisos.

## [7.411.0] - 2026-09-01

### Fix (auditoría R9 · lotes A, B y C — 17 hallazgos)

LOTE A · integridad y fiscal

- R9-01: `set_supplier_bill_approval_status()` compara también `NEW.total` vs `OLD.total`, de modo que un cambio de importe con TC faltante (ambos totales MXN en NULL) ya no sale por el no-op sin re-evaluar aprobación. Guards de pagos, aprobada y segregación de funciones intactos.
- R9-02: nuevo `supabase/functions/_shared/fxGate.ts`; los tres timbrados comparten el mismo gate FX (`fx_is_missing` en TS): divisa sin TC válido (null, <= 0 o exactamente 1) no se timbra.
- R9-03: `get_customer_summary()` se calcula desde `v_invoices_with_balance` y expone `fx_missing_count`; el PDF de estado de cuenta muestra la advertencia en lugar de sumar 1:1. Sigue SECURITY DEFINER con `search_path` fijo.
- R9-13: `stamp-credit-note/handler.ts` usa actualización condicional y consulta al PAC antes de reintentar, eliminando el doble timbrado de una misma nota de crédito.

LOTE B · barrido canónico de FX

- Nuevos helpers SQL `public.fx_to_mxn` y `public.fx_convert_amount` como única autoridad de conversión.
- R9-06: `v_invoices_with_balance` soporta pagos cross-currency en ambos sentidos y expone `payments_fx_missing`.
- R9-07: `v_overdue_invoices` sin fallback 1:1.
- R9-09: seis consumidores SQL (reportes, dashboard y rentabilidad) migrados a los helpers; `supabase/tests/r9_fx_canonical_guard.sql` impide reintroducir reglas FX duplicadas.
- R9-10: `create_recurring_invoice()` falla cerrado ante TC inválido en divisa.
- R9-11: en `useAccountsPayableKpis`, una bill en divisa sin TC cuenta en `countPorAprobar` sin sumar importe a `totalPorAprobar`.

LOTE C · operación, reportes y coherencia

- R9-04: nuevo `public.bank_amount_in_account_currency`; auto-match, candidatos y confirmación comparten una sola conversión. Sin TC no hay candidato (NULL, no importe crudo). Locks, roles e idempotencia sin cambios.
- R9-23: `unmatch_bank_line()` sólo revierte líneas `matched`/`suggested` y ya no borra `ignored_reason`.
- R9-05: `generate-recurring-maintenance/logic.ts` verifica la existencia real del log cuando el claim es rechazado (evita huecos permanentes) y reporta rollback fallido/desplazado en vez de silenciarlo.
- R9-08: la depreciación de `get_income_statement()` filtra `forklifts.deleted_at IS NULL`.
- R9-12: catálogo SAT — 629 y 630 sólo persona física.
- R9-14: `resolveVatRatePercent` distingue 0% explícito de dato ausente (16%).
- R9-16: `report_utilization_by_unit` y `report_utilization_by_model` comparten universo de flota (sin archivados, vendidos/retirados ni `is_e2e`).
- R9-21: el drag & drop del Kanban de mantenimiento archivado ya no invalida la caché del tablero activo.
- Excluidos por indicación explícita: R9-15, R9-17, R9-18, R9-19, R9-20; R9-22 ya resuelto.
- Smoke: `supabase/tests/r9_lote_ac_smoke.sql`, `supabase/tests/r9_fx_canonical_guard.sql`. Pruebas: `src/lib/money/__tests__/vatRate.test.ts`, `useAccountsPayableKpis.fxMissing.test.ts`, `generate-recurring-maintenance/logic_test.ts`, `_shared/fxGate_test.ts`.

## [7.410.0] - 2026-09-01

### Security (auditoría R10 · cuentas por pagar) — R10-01 / R10-02

- R10-01: `public.request_bill_reapproval()` podía resolver una factura **rechazada** a `not_required` cuando el total en MXN quedaba bajo `company_settings.cxp_approval_threshold_mxn`, borrando además `rejected_by/rejected_at/approval_notes`. El propio solicitante (admin/administrativo) borraba así un rechazo explícito y la factura quedaba pagable sin segundo par de ojos.
- R10-01: ahora la reaprobación fija **siempre** `approval_status = 'pending'` (nunca `not_required`, nunca `approved`), sin importar umbral ni tipo de cambio. Sólo limpia `approved_by/approved_at`; la evidencia del rechazo se conserva hasta que un aprobador resuelva el nuevo ciclo. `supplier_bill_approvals` y `activity_feed` siguen registrando el evento `reapproval_requested`.
- R10-01: por coherencia, `set_supplier_bill_approval_status()` también fuerza `pending` cuando `OLD.approval_status = 'rejected'` y se corrige un campo financiero (antes podía caer en `not_required` por debajo del umbral). El resto de la re-evaluación de R9-08 no cambia.
- R10-02: `set_supplier_bill_approval_status()` y `guard_supplier_bill_approval()` retornaban temprano cuando `auth.jwt() ->> 'role'` era NULL, es decir cualquier conexión sin JWT (SQL directo, backfills, herramientas internas) se saltaba el recálculo de aprobación y los candados de "ya aprobada" / "ya tiene pagos".
- R10-02: se elimina ese bypass. Se conservan sólo los dos caminos confiables: rol de servicio real (`auth.jwt() ->> 'role' = 'service_role'` y, en el trigger no-DEFINER, `current_user = 'service_role'` por el `SET ROLE` de PostgREST) y la convención interna acotada `app.cxp_rpc = 'on'` que ya usan `approve_supplier_bill`, `reject_supplier_bill` y `request_bill_reapproval`.
- Sin cambios en RLS, permisos, UI, portal, facturación recurrente, normalización fiscal ni mantenimiento.
- Smoke: `supabase/tests/r10_cxp_approval_integrity_smoke.sql`.

## [7.409.6] - 2026-09-01

### Refactor (auditoría R9 · deduplicación y privilegios) — R9-04 / R9-06 / R9-10 / R9-05

- R9-04: `stamp-cfdi/handler.ts` usa `resolveReceptorRegimenFiscal` del módulo compartido (igual que NC y REP). Comportamiento idéntico: global XAXX -> `"616"`, no global -> valor recortado + `isValidRegimenFiscalCode`. Sin cambios en el payload al PAC. Función redesplegada.
- R9-06: nueva migración idempotente que revoca `EXECUTE` de PUBLIC/anon/authenticated sobre `public.normalize_regimen_fiscal(text)` y conserva `service_role`. Sin llamadas desde la app (sólo aparece en `types.ts` generado). Incluye assert de privilegios en la propia migración.
- R9-10: `src/features/dashboard/lib/collectionForecast.ts` delega en el `isFxMissing` canónico de cash-flow; se conserva la bandera `fx_missing` de la vista y todos los cálculos/filtros del pronóstico.
- R9-05: sin cuarta lista. Nueva prueba `satRegimenSqlParity.test.ts` deriva los códigos del catálogo del frontend y los contrasta con el fuente SQL de `normalize_regimen_fiscal`.
- R9-07 intencionalmente sin cambios (no hay consumidor service/cron actual; sería especulativo).

## [7.409.5] - 2026-09-01

### Fix (auditoría R9 · portal) — R9-09

- `derivePortalKpis` contaba en `fxMissingCount` cualquier factura en divisa sin tipo de cambio válido, incluidas las de saldo cero, que no distorsionan ningún total en MXN.
- Ahora sólo se cuentan las facturas con saldo real por convertir (> `BALANCE_EPSILON`, la tolerancia ya usada por el Estado de Cuenta y el filtro "Solo con saldo").
- Se reutiliza la regla canónica `isFxMissing` de cash-flow; sin nuevas reglas FX ni umbrales mágicos. Resto de KPIs del portal sin cambios.
- Pruebas: `src/features/portal/lib/__tests__/portalKpis.test.ts`.

## [7.409.4] - 2026-09-01

### Fix (auditoría R9 · régimen fiscal) — R9-03

- La reparación de `receptor_regimen_fiscal` de R8-14 sólo cubría `status='draft'`, pero existen facturas `sent`/`partial`/`paid` sin timbrar (`cfdi_uuid IS NULL`) que siguen siendo fiscalmente mutables y timbrables.
- Nueva migración inmutable con predicado por estado de emisión fiscal: `cfdi_uuid IS NULL AND cfdi_status NOT IN ('stamped','cancelled') AND status <> 'cancelled' AND cancellation_status IN ('none','')`. Las canceladas quedan fuera aunque no tengan UUID (evidencia congelada).
- Reutiliza `public.normalize_regimen_fiscal(text)`; sólo escribe cuando la normalización es determinista y cambia el valor. Ambiguos intactos. Idempotente; 0 filas candidatas en vivo antes y después.
- Sin cambios en notas de crédito, complementos de pago, snapshots fiscales ni otros campos de la factura. Ningún cambio de TypeScript.
- Smoke: `supabase/tests/r9_03_regimen_fiscal_no_timbradas_smoke.sql`.

## [7.409.3] - 2026-09-01

### Fix (auditoría R9 · cuentas por pagar) — R9-08

- `set_supplier_bill_approval_status()` sólo recalculaba desde `pending`/`not_required`: una factura rechazada que se corregía (total, moneda o tipo de cambio) seguía `rejected` y quedaba fuera de los KPIs y del aging de CxP pese a tener saldo. Ahora `rejected` también entra a la re-evaluación cuando cambia un campo financiero relevante.
- La re-evaluación limpia `rejected_by`, `rejected_at` y `approval_notes`, y resuelve a `pending` (umbral superado o FX faltante, fail-closed con `public.fx_is_missing`) o `not_required`. Nunca auto-aprueba.
- `public.request_bill_reapproval()` deja de forzar siempre `pending`: aplica el mismo umbral (`company_settings.cxp_approval_threshold_mxn`) y la regla canónica de tipo de cambio faltante.
- Sin cambios en RLS, segregación de funciones, candados de factura aprobada/con pagos ni semántica de borradores. Las ediciones no financieras (p. ej. `notes`) no alteran el estado de aprobación.
- Smoke: `supabase/tests/r9_08_supplier_bill_rejected_recalc_smoke.sql` (bajo umbral → not_required, sobre umbral → pending, USD TC=1 → pending, notas → rejected intacto, candado de aprobada intacto).

## [7.409.2] - 2026-09-01

### Fix (auditoría R9 · facturación recurrente) — R9-01 / R9-02

- R9-01: `reconcileRecurringSelection` conserva `history` e `intentSelected` de las reservas ausentes del preview mientras el diálogo siga abierto, así una fila que desaparece y reaparece con la misma firma material mantiene la intención del operador en vez de auto-seleccionarse como nueva.
- Una reaparición con firma distinta (periodo, monto facturable, IVA o prorrateo) sigue quedando desmarcada y requiere re-aprobación manual (comportamiento R8-05 intacto).
- R9-02: `RecurringInvoicesPreviewDialog` detecta la transición de cierre→apertura y reinicia `allowStaleRate=false` y la selección desde el preview actual; el consentimiento de tarifa modificada es explícito por sesión y no se hereda al reabrir.
- Dentro de una sesión abierta no cambia nada: los refrescos del preview no reinician las decisiones y el switch de tarifa modificada sólo afecta a las líneas con aviso.
- Tests: `recurringSelection.test.ts` (+4) y nuevo `src/features/invoices/components/recurring/__tests__/RecurringInvoicesPreviewDialog.test.tsx` (3).

## [7.409.1] - 2026-09-01

### Fix (auditoría R8 · cierre de bajos) — R8-11 / R8-13 / R8-14

- R8-11: el KPI "sin tipo de cambio" de CxP contaba antes de filtrar borradores mientras el aging los excluía; ahora ambos cuentan el mismo universo exigible (no borrador, con saldo) con el predicado canónico `isFxMissing`.
- R8-13: migración idempotente que hace explícita la decisión de privilegios sobre `public.releasable_payment_locks(integer)` (sin EXECUTE para anon/authenticated). Los wrappers SECURITY DEFINER siguen funcionando. La entrada en `types.ts` es informativa, no una frontera de autorización.
- R8-14: nuevo `public.normalize_regimen_fiscal(text)` y reparación fail-safe de `receptor_regimen_fiscal` sólo en facturas borrador sin timbrar con prefijo determinista de código SAT soportado (0 filas candidatas en vivo). No se toca ningún documento timbrado, enviado, pagado o cancelado.
- Tests: `useAccountsPayableKpis.test.ts` (+2) y smoke `supabase/tests/r8_13_14_privilegios_regimen_smoke.sql`.

## [7.409.0] - 2026-09-01

### Fix (auditoría R8 · CFDI régimen fiscal) — R8-06 / R8-09

- R8-06: nuevo helper compartido resolveReceptorRegimenFiscal; el receptor global (XAXX010101000) envía exactamente `616` al PAC en stamp-credit-note y stamp-payment-complement (antes podía ir la etiqueta heredada "616 - Sin obligaciones fiscales").
- R8-09: aplicabilidad explícita para 607, 609, 611, 615, 628, 629 y 630; se elimina el fallback permisivo que aceptaba persona física y moral para códigos sin matriz.
- Fallback conservador: un código sin aplicabilidad declarada ya no aplica a nadie (falla cerrado).
- Pruebas nuevas: `supabase/functions/_shared/regimenFiscal_test.ts` (3) y `src/lib/fiscal/regimenFiscal.test.ts` (5, incluye paridad de catálogos cliente/servidor).

## [7.408.0] - 2026-09-01

### Fix (auditoría R8 · facturación recurrente) — R8-05 / R8-12

- Nuevo reducer puro `src/features/invoices/lib/recurringSelection.ts`: la selección del asistente se reconcilia contra las filas actuales del preview en vez de reconstruirse desde cero.
- R8-05: las reservas que desaparecen, dejan de ser elegibles o cambian de periodo / monto facturable / IVA se desmarcan y no se vuelven a marcar solas (requieren re-aprobación explícita).
- R8-12: lo que el operador desmarcó nunca se re-agrega por un refresh del preview ni por alternar la confirmación de tarifa modificada; ese switch sólo agrega las líneas con `rateWarning` no desmarcadas.
- Sin cambios de backend: elegibilidad, prorrateo y el candado `allowStaleRate` siguen siendo autoridad del Edge Function.
- Tests: `src/features/invoices/lib/__tests__/recurringSelection.test.ts` (19 casos).

## [7.407.1] - 2026-09-01

### Fix (auditoría R8 · CxP) — R8-10

- `set_supplier_bill_approval_status`: el total en MXN se calculaba con `COALESCE(NEW.exchange_rate, 1)`, así que una divisa sin TC real (nulo, <= 0 o exactamente 1) se convertía 1:1 y podía quedar por debajo del umbral como `not_required`.
- Ahora usa el helper canónico `public.fx_is_missing(currency, exchange_rate)`: si el TC falta o es inválido en moneda extranjera, `approval_status` = `pending` (fail closed) y no se inventa total en pesos.
- La comparación de UPDATE también considera el cambio de validez del TC; umbral, segregación de funciones, guards de pagos y transiciones de estatus quedan intactos.
- Smoke: `supabase/tests/r8_10_supplier_bill_fx_approval_smoke.sql` (MXN bajo/sobre umbral, USD TC=20 bajo/sobre umbral, USD 0 / negativo / 1 => pending, matriz de `fx_is_missing`, alta pre-aprobada sigue bloqueada).

## [7.407.0] - 2026-09-01

### Fix (auditoría R8 · consistencia FX) — R8-02 / R8-03 / R8-04

- Nuevo helper SQL canónico `public.fx_is_missing(moneda, tipo_cambio)`: divisa con TC nulo, <= 0 o exactamente 1. MXN nunca es fx_missing.
- `v_invoices_with_balance`: `fx_missing`, `total_mxn` y `balance_mxn` derivan del helper (TC = 1 en divisa ya no convierte 1:1). Se conserva `security_invoker = true`.
- `get_financial_kpis`: MRR actual/previo y `overdue_total` excluyen documentos fx_missing y sus contadores (`mrr_fx_missing_count`, `mrr_prev_fx_missing_count`, `overdue_fx_missing_count`) usan el mismo predicado. Recreada con `CREATE OR REPLACE` completo (sin parcheo por string).
- `get_portal_invoices`: deja de hacer `COALESCE(tipo_cambio, 1)`; devuelve el valor real (nullable). Guards de rol/RLS sin cambios.
- Portal: `derivePortalKpis` y el nuevo `lib/statementRows.ts` reutilizan el helper TS canónico `isFxMissing` de cash-flow; el Estado de Cuenta excluye esas filas de los totales MXN, muestra el aviso y el filtro "Solo con saldo" usa `balanceMxn`.
- Tests: `statementRows.test.ts`, `portalKpis.test.ts` y smoke `supabase/tests/r8_fx_missing_smoke.sql` (matriz MXN / USD null / 0 / negativo / 1 / 18).

## [7.406.2] - 2026-09-01

### Fix (monitoreo)

- Kanban de mantenimiento: el optimistic update usaba la key `{forkliftId: null}` mientras la lista se cachea como `{forkliftId: null, archived: false}`; ahora ambos comparten `maintenanceLogQueries.list(...)`, así la tarjeta se queda en la columna destino sin esperar el refetch.

## [7.406.1] - 2026-09-01

### Fix (auditoría R8 · cron de mantenimiento)

- `generate-recurring-maintenance`: el catch-up mensual se extrajo a `logic.ts` (testeable sin red) manteniendo las reglas de negocio.
- Un `23505` contra el índice único parcial `(policy_id, policy_month)` se trata como mes ya generado: avanza `lastOkMonth` y continúa el catch-up (R8-01).
- El rollback de `last_generated_month` es compare-and-set (`.eq('last_generated_month', month)`): una corrida concurrente no puede ser retrocedida (R8-07).
- `claimErr` corta el bucle de meses de esa póliza (antes `continue`, que podía dejar un hueco permanente) (R8-08).
- Nuevos tests Deno en `logic_test.ts`: recuperación tras fallo transitorio con duplicado posterior, rollback condicional y corte por claim fallido.

## [7.406.0] - 2026-09-01

### Fix (auditoría R7 · lote 3)

- `get_income_statement`: nueva CTE `contributing_bill_ids` — el gasto operativo ligado a una `supplier_bill` sólo se deduplica si esa factura aporta al periodo/base (antes desaparecía del P&L si la factura estaba cancelada/draft/rechazada, sin TC o impaga en base cash) (R7-10).
- CxP: el botón "Liberar bloqueos" se habilita con `count_releasable_payment_locks` (universo completo, mismas precondiciones del RPC) y muestra el conteo liberado en un toast (R7-12).

## [7.405.0] - 2026-09-01

### Fix (auditoría R7 · lote 2)

- `_shared/regimenFiscal.ts`: catálogo `c_RegimenFiscal` completo (añadidos 609/628/629/630) y `normalizeRegimenFiscal` con frontera `(?!\d)` — "6010" ya no se normaliza a "601" (R7-04, R7-16).
- `src/lib/domain/satCatalogs.ts` alineado 1:1 con el catálogo del servidor (R7-04).
- `stamp-credit-note` y `stamp-payment-complement` aplican el fail-fast 422 de régimen fiscal antes de llamar al PAC (R7-03).
- `isFxMissing` (cash-flow y `collectionForecast`) trata TC = 1 en moneda foránea como faltante; `parseCfdiXml` devuelve `exchangeRate: null` sin `TipoCambio` y el formulario de CxP rechaza TC = 1 en divisa (R7-08).
- `useAgingReport` itera `visibleListRows` igual que los KPIs de CxP (R7-13).
- `FinancialKpiCards`: la tarjeta de MRR vigente muestra sólo su propio conteo de exclusiones (R7-14).
- Verificado en producción: sin snapshots legacy de régimen fiscal (R7-07) y sin duplicados que bloqueen `operating_expenses_supplier_bill_id_uniq` (R7-17).

## [7.404.0] - 2026-09-01

### Fix (auditoría R7 · lote 1)

- `set_supplier_bill_approval_status` usaba `supplier_payments.supplier_bill_id` (inexistente): toda edición de monto/moneda de una factura con pagos fallaba con 42703.
- `release_bills_on_batch_delete` ya no libera facturas que siguen en otro lote vivo; `release_stale_payment_locks` comparte predicado con la nueva `releasable_payment_locks` y libera lotes abandonados sin pagos.
- `maintenance_logs.policy_id`/`policy_month` + índice único parcial: el cron de pólizas es idempotente y el rollback del claim ya no salta meses.
- `v_booking_occupancy` con `security_invoker = on` y casts de fecha en America/Monterrey.
- `get_financial_kpis`: TC ≤ 0 se trata como faltante (antes restaba del MRR).
- Portal: el saldo pendiente excluye facturas en divisa sin TC y muestra el conteo excluido.
- Vista previa de recurrentes: activar `allowStaleRate` ya no reinicia las deselecciones manuales.

## [7.403.0] - 2026-09-01

### Fix (auditoría R6 · gastos + MRR)

- `operating_expenses.supplier_bill_id` poblado por backfill 1:1 (131/142) y con índice único parcial; la heurística monto+fecha queda sólo como respaldo legacy.
- `get_financial_kpis` expone `mrr_prev_fx_missing_count`; el KPI de MRR avisa las rentas en divisa excluidas por falta de TC (nunca 1:1).

## [7.402.0] - 2026-09-01

### Fix (auditoría R6 · recurrentes + contratos)

- Los periodos recurrentes cuya reserva se editó después del periodo ya no se facturan sin confirmación explícita del operador (fail-closed); el cron nunca los factura.
- La vista previa marca esos periodos y exige confirmar antes de incluirlos; la respuesta reporta `skippedStaleRate`.
- Backfill: los contratos firmados sin respaldo ahora tienen su copia inmutable de cliente, unidad y plantilla.

## [7.401.0] - 2026-09-01

### Fix (auditoría R6 · fiscal + CxP)

- El timbrado valida que el régimen fiscal del receptor sea un código de 3 dígitos del catálogo SAT (c_RegimenFiscal) y responde 422 explicando el error antes de llamar al PAC.
- `parse-csf` normaliza el régimen fiscal extraído al código puro; si no es reconocible, deja el campo vacío.
- Al eliminar un lote de pago a proveedores, se liberan las facturas sin pagos registrados (`payment_in_progress_at`).
- Nuevo RPC `release_stale_payment_locks` (admin/administrativo) y botón "Liberar bloqueos" en Facturas de Proveedor para facturas atoradas >24 h sin lote vivo ni pagos.

## [7.400.0] - 2026-09-01

### Fix (auditoría R5 · integridad)

- Archivar una orden de trabajo abierta ya no borra sus refacciones ni su mano de obra.
- Nueva vista "Archivados" en Mantenimiento y Seguimiento de Daños con restauración para administradores (queda en bitácora).
- Una cotización convertida vuelve a "Aceptada" cuando todas sus reservas se cancelan.
- La liberación de un daño al cancelar/eliminar su factura queda registrada en la bitácora del equipo.
- Criterio único de "unidad devuelta" basado en la inspección de retorno.

## [7.399.0] - 2026-09-01

### Feature (auditoría R5)

- Los administradores pueden reabrir una OT cerrada por error desde el detalle de mantenimiento (con motivo obligatorio).
- Los cambios de estatus de reserva usan bloqueo optimista: si otro usuario ya la movió, el sistema avisa en vez de pisar el cambio.

## [7.398.2] - 2026-09-01

### Fix (auditoría R5)

- Una cotización cuyas reservas fueron todas canceladas ya puede eliminarse; las que tienen reservas vigentes o están aceptadas siguen protegidas.
- En el calendario, el mantenimiento se dibuja como la ventana completa (fecha del servicio ± los días de holgura configurados) en lugar de una marca de un solo día.
- Las pruebas automáticas se ejecutan con zona horaria fija, eliminando una falla intermitente en el cálculo de vencimientos de facturas de proveedor.

## [7.398.1] - 2026-08-31

### Fix (validación fiscal SAT)

- Se corrigió la lectura de la respuesta del PAC: la consulta valida el RFC contra la lista EFOS (art. 69-B) del SAT y devuelve el resultado dentro de `efos`, que antes no se interpretaba y marcaba a todos como con diferencias.
- Cuando el SAT responde sin detalle, se guarda y muestra el mensaje textual del SAT en vez de dejar la columna en blanco.
- Los mensajes de error del PAC se normalizan a un texto legible con el nombre del campo (RFC, razón social, régimen fiscal, C.P.).
- Se ajustaron los textos de la pantalla para reflejar lo que realmente se valida: “Sin observaciones” / “Con observaciones (EFOS 69-B)” y datos fiscales incompletos.

## [7.398.0] - 2026-08-31

### Feature (cron CFDI + validación masiva SAT)

- Las tareas programadas (reintentos de timbrado, reconciliación, facturación y mantenimiento recurrente) vuelven a ejecutarse: ahora aceptan tanto el secreto del entorno como el guardado en la bóveda de la base de datos.
- Se eliminaron tareas programadas obsoletas y se reagendaron las vigentes con la firma correcta.
- Nueva pantalla “Validación fiscal contra el SAT” en Clientes: valida en lote hasta 40 clientes por corrida, sin consumir timbres, y muestra el estado (coincide, diferencias, error) con la fecha de la última validación.
- Cada cliente guarda su estado de validación fiscal, la fecha y el detalle de diferencias.
- La validación fiscal de facturas y la masiva comparten la misma lógica de consulta al PAC.

## [7.397.0] - 2026-08-31

### Refactor (pulido YAGNI)

- El historial de cambios abre mostrando las versiones recientes y carga el archivo completo solo cuando se pide, reduciendo la descarga inicial de ~650 KB a ~56 KB.
- Se eliminaron tres funciones de servidor que ya no tenían consumidores.
- Todas las pantallas usan un único formateador de fechas (zona horaria Monterrey), eliminando la variante duplicada en 61 archivos.
- Se documentó en la arquitectura por qué se conservan las librerías con un solo punto de uso.
- Sin cambios en reglas de negocio, permisos, RLS ni base de datos.

## [7.396.2] - 2026-08-31

### Fix (pruebas SQL de humo y permisos de periodos fiscales)

- Las pruebas de humo dejaron de referenciar la columna inexistente `bill_date` (ahora `issue_date`) y apuntan a `sync_invoice_status`, donde vive la lógica de saldos.
- Se actualizaron aserciones de texto desfasadas: buffer de mantenimiento configurable en `create_booking`, guard `(select auth.uid())` en `sync_forklift_rental_status`, liberación en `complete_return_inspection`, mensaje de `validate_transition`, FX en `trg_payment_amount_mxn`, bandera `app.maintenance_archive_rpc` y `app.e2e_seed`.
- Se revocaron los permisos heredados del rol anónimo sobre `fiscal_periods` (las policies ya lo bloqueaban).
- `useCustomerDetailPage` extrae el cálculo de totales para bajar la complejidad reportada por ESLint.

## [7.396.1] - 2026-08-31

### Fix (pruebas)

- Las pruebas de `rfcOptional` usaban RFCs inventados sin dígito verificador válido y fallaban desde que A4-05 activó el checksum SAT; ahora usan ejemplos consistentes.
- Sin cambios funcionales, de RLS ni de permisos.

## [7.396.0] - 2026-08-31

### Fix (estado de resultados, MRR, rechazo de CxP y quick wins)

- **2A-1:** `get_income_statement` convierte gastos y facturas de proveedor en divisa con su tipo de cambio, excluye borradores y rechazadas, y reporta `fx_missing`; el reporte muestra un aviso cuando hay documentos sin tipo de cambio.
- **A2-7:** `get_mrr_detail` excluye rentas recurrentes en divisa sin tipo de cambio y devuelve `fx_missing_count`; la pantalla de MRR avisa cuántas quedaron fuera.
- **A6R2-2:** `supplier_bills` gana `rejected_by` / `rejected_at`; `reject_supplier_bill` deja de escribir en `approved_by` y el detalle muestra la fecha real de rechazo.
- **A3B-05:** una cotización cuyas reservas fueron todas canceladas vuelve a ser convertible (RPC y UI ignoran reservas canceladas).
- **A4-05:** el RFC opcional de clientes y proveedores valida el dígito verificador desde la captura.
- **A5-05:** el formulario de cotización envía la versión leída (bloqueo optimista) y avisa si otro usuario guardó antes.
- **A1-6:** al reeditar cotizaciones antiguas las partidas se deduplican por ocurrencia (no por modelo) y respetan el tipo de tarifa (diaria/semanal/mensual).
- Sin cambios en RLS, permisos ni máquinas de estado.

## [7.395.0] - 2026-08-31

### Feature (buffer de mantenimiento configurable)

- **A6R2-7:** el buffer de días alrededor del próximo servicio deja de estar hardcodeado; ahora vive en `company_settings.maintenance_buffer_days` (default 3, rango 0-30) y lo leen `create_booking`, `extend_booking` y `get_available_forklifts` vía `public.maintenance_buffer_days()`.
- Nueva tarjeta **Buffer de Mantenimiento** en Configuración > Pólizas de Mantenimiento (`MaintenanceBufferCard`) con los hooks `useMaintenanceBuffer` / `useUpdateMaintenanceBuffer`.
- Sin cambios en RLS, permisos ni máquinas de estado.

## [7.394.0] - 2026-08-31

### Fix (residuales fiscales y devoluciones)

- **B5-02:** el PDF de estado de cuenta resta `total_credited` al saldo y muestra la tarjeta de notas de crédito.
- **Residual (a):** `stamp-credit-note` y `stamp-payment-complement` ya no usan los defaults `616`/`06600`; exigen régimen y CP fiscal reales salvo receptor genérico `XAXX010101000`.
- **Residual (b):** `create_recurring_invoice` ya no aplica `G03` por default; si el cliente no tiene uso de CFDI, el periodo falla con mensaje explicable.
- **Residual (c):** la llave de agrupación de `generate-recurring-invoices` incluye moneda y tipo de cambio (ya no se mezclan MXN y USD en una factura).
- **A3B-03:** `complete_return_inspection` rechaza `inspected_at` futuro (antes permitía hasta 30 días adelante).
- Sin cambios en RLS, permisos ni máquinas de estado.

## [7.393.2] - 2026-08-31

### Chore (calidad de código)

- Se redujo la complejidad reportada por ESLint: `quoteFormSchema` divide su `superRefine` en `refineRentalLines`/`refineSaleLines`/`refineDateRange`, `useQuoteDetailData` extrae `useQuoteLinks`, `ContractDetail` usa `ContractDetailFallback`/`InfoCard`/`depositProps` y `CalendarPage` mueve el Gantt a `components/calendar/GanttCard.tsx` con el hook `useMaintenanceWindows`.
- Sin cambios funcionales, de validaciones, RLS, permisos ni cálculos.

## [7.393.1] - 2026-08-31

### Chore (arquitectura)

- Se eliminaron los 2 imports profundos entre features detectados por `arch:check`: `useDamagePrefill` y `useAgingReport` ahora importan desde los barrels públicos `@/features/damage` y `@/features/cash-flow`.
- Sin cambios funcionales, de RLS, permisos ni cálculos.

## [7.393.0] - 2026-08-31

### Fix (bugs abiertos — lotes 2 y 3)

- **A6R2-5:** el kanban de mantenimiento ya no permite arrastrar una OT `completed`/`cancelled` a un estado abierto; muestra el bloqueo explicable `maintenance_work_order_closed` y la reapertura formal sigue siendo por `reopen_work_order` (admin + motivo).
- **A6R2-6:** nuevo trigger `trg_release_damage_on_invoice_cancel` (+ borrado) que desliga el daño de la factura cancelada y lo regresa a `repaired`, para que vuelva a ser facturable.
- **2A-8:** nueva vista `v_booking_occupancy` (entrega real / devolución real, rentas vencidas cuentan hasta hoy) usada por `utilization` y `monthly_utilization` en `get_dashboard_stats`.
- **B5-06:** `sanitizeInvoiceSearchForQuery` también neutraliza `_`, que es comodín de `ilike`.
- Sin cambios en RLS, permisos, máquinas de estado ni cálculos fiscales.

## [7.392.1] - 2026-08-31

### Fix (UX de bloqueos explicables — CxP)

- `useApproveSupplierBill` acepta `onBusinessBlock` y `ApproveBillDialog` muestra `BlockedActionNotice` con el código `supplier_bill_self_approval` en vez del toast genérico.
- Sin cambios en RLS, permisos, RPC ni cálculos.

## [7.392.0] - 2026-08-31

### Fix (catálogo QA — segregación de funciones CxP y utilización del tablero)

- **CxP:** `approve_supplier_bill` rechaza la auto-aprobación (`created_by = auth.uid()`) con `check_violation`; se agregó el bloqueo explicable `supplier_bill_self_approval`.
- **2A-7:** `get_dashboard_stats` excluye reservas `is_e2e` en `overdue_bookings`, `utilization` y `monthly_utilization`.
- Sin cambios en RLS, permisos, máquinas de estado ni cálculos fiscales.

## [7.391.0] - 2026-08-31

### Fix (catálogo QA — lotes 2/3: A6R2-3, A6R2-4, 2A-9, A3B-03, A4B-05, estado de resultados FX)

- **A6R2-3:** `capture_contract_signed_snapshot` + `contracts.signed_snapshot` guardan contrato, cliente, unidad y plantilla al firmar; el snapshot es inmutable y `src/lib/pdf/contract/fetchers.ts` lo usa para rendir el PDF de contratos firmados.
- **A6R2-4:** `contracts.deposit_status/deposit_settled_at/deposit_settled_amount/deposit_notes` + RPC `set_contract_deposit_status` (admin/administrativo, monto ≤ depósito) y `ContractDepositCard`.
- **Estado de resultados:** `get_income_statement` excluye documentos en divisa sin TC válido y facturas de proveedor `rejected`; expone `fx_missing`.
- **2A-9:** `recurringBookingItems` proyecta las rentas recurrentes no facturadas dentro del horizonte del flujo de efectivo (FX-aware, marcadas `isProjected`).
- **A3B-03:** la inspección de devolución rechaza fechas futuras.
- **A4B-05:** RPCs `restore_customer` / `restore_supplier` (sólo admin). Falta la vista de archivados en UI.
- Sin cambios en RLS, permisos, máquinas de estado ni cálculos fiscales existentes.

## [7.390.0] - 2026-08-31

### Fix (catálogo QA — lote 1: A4B-01/02/03/04/06, A3B-01/02/04/05/06, A1-1, 2A-1(parcial), 2A-3, 2A-4, 2A-5, 2A-6, A6R2-1, A6R2-8, A4B-08/09/10, B5-01, B5-07, B5-08)

- **A4B-01/02/03:** `get_forklift_financials`, `get_customer_profitability` y `get_sidebar_badge_counts` excluyen OTs archivadas (`deleted_at`) y `is_e2e`.
- **A4B-04:** `audit_fleet_status_consistency` y `guard_forklift_status_change` dejan de tratar OTs archivadas como abiertas.
- **A4B-06:** `create_booking` rechaza montacargas archivados.
- **A3B-02:** `sync_forklift_status_on_maintenance` devuelve la unidad a `rented` (no `available`) cuando sigue habiendo renta activa.
- **A3B-06:** `sync_forklift_rental_status` no degrada unidades con daño/OT abierta y escribe `status_logs`.
- **A3B-01/A3B-05:** `guard_quote_cancellation` cubre también `converted → cancelled`.
- **A3B-04:** `cancel_booking` bloquea la cancelación si hay facturas emitidas vigentes ligadas.
- **A1-1:** `create_recurring_invoice` recibe `p_moneda`/`p_tipo_cambio` (TC obligatorio en divisa) y `generate-recurring-invoices` los propaga desde la reserva.
- **2A-4:** `prepare_payment_complement` descuenta NCs timbradas vigentes del `prior_balance`.
- **A6R2-1:** `set_supplier_bill_approval_status` ahora corre en `INSERT OR UPDATE OF total, currency, exchange_rate`; reevalúa el umbral y bloquea cambios con pagos o ya aprobada.
- **2A-5:** `parseAmount` interpreta `"1.500"` como miles.
- Frontend: 2A-3 (rechazadas fuera de KPIs/aging), 2A-6 (fechas imposibles), B5-07 (Windows-1252), A4B-10 (5 MB CSF), A6R2-8 (reintento de captura), A4B-08/09 (catálogo SAT y validación RFC↔régimen), B5-08 (mes calendario), B5-01/B5-02/B5-04/B5-06 (moneda, tarifas legacy, redondeo por partida, saneado de búsqueda).
- Sin cambios en permisos, RLS ni máquinas de estado.

## [7.389.1] - 2026-08-31

### Fix (QA — dígito verificador RFC)

- `src/lib/fiscal/rfcChecksum.ts` mapeaba mal el módulo 11 del algoritmo SAT: el dígito correcto es `11 - (sum % 11)` con 11→"0" y 10→"A"; el código producía "10" (imposible) cuando el residuo era 1 y esperaba "A" cuando debía ser "1". ~2/11 de los RFCs reales eran rechazados en `rfcRequired()` (datos fiscales de la empresa, facturación).
- `rfcChecksum.test.ts` ahora valida contra una implementación de referencia independiente y cubre los casos borde "0", "A" y "1".

## [7.389.0] - 2026-08-31

### Fix (auditoría QA — cierre de hallazgos abiertos: A1-B3, A2-3, A3-07, A5-05, A5-09)

- **A1-B3:** `supabase/functions/stamp-credit-note/handler.ts` reconcilia el total devuelto por Facturapi contra `credit_notes.total` con `computeStampVariance` (mismo contrato que `stamp-cfdi`/BL-A5). Fuera de tolerancia persiste identidad fiscal + `cfdi_status='error'`, `stamp_variance`/`stamp_variance_checked_at` (columnas nuevas) y responde 502.
- **A2-3:** nuevo `useCancelPaymentBatch` (RPC `cancel_supplier_payment_batch`); si `useExportPaymentsForm` crea el lote pero falla la descarga del Excel, el lote huérfano se cancela y libera las facturas. Las reglas de cancelabilidad siguen en el RPC.
- **A3-07:** `validate_delivery_booking_integrity()` ya sólo exime del checklist a los UPDATE. Insertar una entrega con `status='completed'` vuelve a exigir reserva `confirmed` y fecha dentro de `start_date`/`end_date`.
- **A5-05:** `useUpdateBooking` acepta `expectedVersion` opcional (patrón M-11a/R4-25) y distingue `stale_write` de un fallo por RLS; los cambios de estado internos conservan el comportamiento previo.
- **A5-09:** `bank_statement_lines.occurrence` + índice único `(bank_account_id, hash, occurrence)`; `buildLine` calcula el hash sólo con el contenido del movimiento y `assignOccurrences` numera las repeticiones idénticas. Reimportar un archivo traslapado o reordenado ya no duplica, y dos movimientos legítimamente iguales se conservan.
- Sin cambios en permisos, máquinas de estado, cálculos de totales ni RLS.

## [7.388.0] - 2026-08-31

### Fix (auditoría QA — A5-03, A2-9, A4-05, A5-05, A5-06, A5-07, A5-08)

- **A5-03 (PUE):** `enforce_payment_within_invoice_total` rechaza pagos que dejen saldo pendiente en facturas con `metodo_pago='PUE'` y `cfdi_status='stamped'` (`check_violation`).
- **A2-9:** nueva columna `operating_expenses.supplier_bill_id` (FK, `ON DELETE SET NULL`) e índice parcial; `get_income_statement` excluye del dedup heurístico los gastos ya ligados explícitamente.
- **A4-05:** `src/lib/fiscal/rfcChecksum.ts` valida el dígito verificador SAT (con excepción de RFC genéricos) y se aplica en `rfcRequired`.
- **A5-05:** `useUpdateQuote` acepta `version` opcional y aplica bloqueo optimista, avisando en vez de sobrescribir cambios ajenos.
- **A5-06:** `generate-recurring-invoices/prorate.ts` prorratea en centavos enteros.
- **A5-07:** `useGanttSegments`/`GanttRow`/`GanttChart`/`CalendarPage` pintan mantenimientos programados y OT abiertas como capa del Gantt.
- **A5-08:** `forkliftFormSchema` obtiene el año de vigencia del seguro del string `YYYY-MM-DD`, sin `new Date(string)`.
- **A3-01/A3-04:** la reasignación de cliente en cotizaciones aceptadas usa la RPC `reassign_quote_customer`; se retiró el cierre directo de reservas al marcar factura pagada.
- Pendiente documentado: **A5-09** (hash de líneas bancarias) requiere rediseñar el índice único `bank_statement_lines_account_hash_uq` antes de quitar `lineSeq`.

## [7.387.0] - 2026-08-30

### Fix (auditoría QA — A2-1 saldo FX-aware en flujo de efectivo)

- **A2-1:** `src/features/cash-flow/lib/cashFlowTransformers.ts` recalculaba el saldo sumando `payments.amount` crudo, asumiendo que el pago siempre viene en la moneda de la factura. La BD permite el cruce con tipo de cambio, así que un pago en MXN sobre una factura USD subestimaba (o desaparecía) el saldo proyectado.
- `invoiceToItem(inv)` ahora consume `v_invoices_with_balance.balance_mxn`, el saldo canónico que ya usan cobranza y el portal: pagos convertidos con el TC del pago o del documento, NCs timbradas descontadas y conversión final a MXN. `balance_mxn` nulo (TC faltante) excluye la factura, igual que antes.
- `cashFlowProjectionQueries.list` deja de descargar `payments`; `buildPaidByInvoice` queda deprecado para este flujo.
- Sin cambios en SQL, RLS, permisos, máquinas de estado ni lógica fiscal.
- Pruebas: `cashFlowTransformers.test.ts` y `cashFlowFxMissing.test.ts` (31 pruebas de cash-flow verdes).

## [7.386.0] - 2026-08-30

### Fix (auditoría QA — A1-B2 IVA de recurrentes, A5-02 tipo de cambio en cotizaciones)

- **A1-B2:** `supabase/functions/generate-recurring-invoices/index.ts` calculaba el IVA con un solo `Math.round` sobre el subtotal agrupado, divergiendo de `computeTotals` y de Facturapi (que redondean por partida). Nuevo helper `sumLineTaxCents` en `supabase/functions/_shared/money.ts`.
- **A5-02:** las cotizaciones en moneda distinta a MXN capturan `tipoCambio` (obligatorio > 0, mismo criterio que `invoiceFormSchema`), se persiste en `quotes.tipo_cambio` desde `buildQuotePayload` y `buildFromQuote` lo hereda al prellenar el CFDI. Antes quedaba en el DEFAULT 1 (paridad ficticia USD 1:1).
- Sin cambios en SQL, RLS, permisos ni máquinas de estado.
- Pruebas: `supabase/functions/_shared/money_test.ts`, `quoteFormPayload.test.ts` e `invoiceFormBuilders.test.ts`.

## [7.385.0] - 2026-08-30

### Fix (auditoría QA — A6-1 archivado de OT, A4-04 datos fiscales genéricos)

- **A6-1:** `trg_sync_forklift_on_maintenance` ahora es `AFTER INSERT OR UPDATE OF work_status, deleted_at`. Antes sólo escuchaba `work_status`, así que archivar una OT `in_progress` (vía `soft_delete_maintenance_log`) dejaba el montacargas atascado en `maintenance` para siempre. `sync_forklift_status_on_maintenance()` trata la transición `deleted_at NULL -> NOT NULL` como cancelación y conserva todos los frenos: rentas `confirmed` vigentes, daños `reported`/`in_repair` y otras OT `pending`/`in_progress` mantienen la unidad en mantenimiento con su nota en `status_logs`.
- **A4-04:** `supabase/functions/stamp-cfdi/handler.ts` deja de usar los defaults genéricos `616` (régimen) y `06600` (CP) para receptores con RFC real. Si faltan `receptor_regimen_fiscal` o `receptor_domicilio_fiscal_cp` responde 400, libera el claim y no llama al PAC. Público en General (`XAXX010101000`) conserva su comportamiento actual.
- Sin cambios en RLS, permisos, costos, inventario ni cálculos fiscales.
- Pruebas: `supabase/tests/r_fix38_maintenance_archive_releases_forklift_smoke.sql` y `supabase/functions/stamp-cfdi/handler_test.ts` (16 pruebas).

## [7.384.0] - 2026-08-30

### Fix (auditoría QA — críticos A5-01, A1-B1, A1-B3)

- **A5-01 (sobrecobro de 1 día):** `src/lib/domain/rentalCalculation.ts` avanza un día el ancla del remanente cuando `addMonths` clampeó por mes corto (31-ene → 28-feb). Antes sólo neutralizaba el remanente si `endDate` era fin de mes, así que 31-ene → 01-mar facturaba 1 mes + 2 días cobrando dos veces el 28-feb. Reemplaza `isClampedShortMonthEnd` por `isClampedAnchor`.
- **A1-B1 (línea de prorrateo intimbrable):** la línea `Renta mensual (prorrateo N días)` de extensiones sale con `quantity: 1` y `unit_price = total`, cumpliendo la invariante `total === unit_price × quantity` que exige el timbrado. Antes la división entre días dejaba centavos sueltos.
- **A1-B3 (IVA de notas de crédito):** `supabase/functions/stamp-credit-note/handler.ts` respeta `objeto_imp === "01"` (línea sin traslados) y `tax_rate` por línea con fallback a la tasa de la NC, espejo de `stamp-cfdi`. También usa `clave_prod_serv` de la línea antes del genérico `84111506`.
- Sin cambios en SQL, RLS, permisos ni máquinas de estado.
- Pruebas: `src/lib/domain/__tests__/rentalCalculation.test.ts` (4 casos de mes corto + invariante timbrable) y `supabase/functions/stamp-credit-note/handler_test.ts` (objeto_imp/tasa por línea).

## [7.383.1] - 2026-08-30

### Fix (QA): `StatusChangeCard` bloqueaba unidades ya devueltas

- La prevención en UI usaba sólo `currentStatus === 'rented'`, más estricta que el backend: `public.change_forklift_status` sólo rechaza cuando además `public.has_open_rental()` (entrega completada sin devolución). Una unidad devuelta que quedó en estado `rented` no podía volver a disponible/mantenimiento/venta/baja.
- Se elimina el pre-bloqueo determinista; el rechazo real del backend se sigue explicando con `describeForkliftRentalBlock` vía `onBusinessBlock`. Sin cambios en SQL, RPC ni reglas.
- Prueba de regresión: `src/features/fleet/components/forklift-detail/__tests__/StatusChangeCard.test.tsx`.

## [7.383.0] - 2026-08-30

### Feat (integridad): saldo pendiente como regla dura para archivar clientes

- Nuevas funciones `public.customer_outstanding_balance(uuid)` y `public.customer_has_outstanding_balance(uuid)` (SECURITY DEFINER, `SET search_path = public`, `EXECUTE` revocado a `anon`/`authenticated`): definición canónica del saldo por cobrar reutilizando `v_invoices_with_balance` (`balance_mxn`, estados `sent`/`partial`/`overdue`, sin `cancellation_status = 'accepted'`) — la misma fuente que `get_customer_summary.outstanding_revenue`. Tolerancia monetaria 0.01, igual que los guards de pagos.
- `public.soft_delete_customer()` y `public.guard_customer_archive()` aplican el MISMO helper: RPC y UPDATE directo no pueden divergir; la BD es la autoridad ante carreras. Rechazo de negocio con P0001 (`No se puede archivar: el cliente tiene saldo pendiente`); permisos siguen con 42501.
- Sin cambios en v7.380.0: sólo admin/administrativo archivan, reservas `confirmed`/`in_progress` siguen bloqueando, desarchivar y ediciones normales intactas. No se borra, cancela ni desliga ninguna factura, pago o cobranza.
- UX: nuevo código explicable `customer_outstanding_balance` en `lib/rules/businessBlocks` (+ patrón de reconocimiento); `CustomerDeleteDialog` usa esa copia canónica y muestra `BlockedActionNotice` si la BD rechaza por carrera (`useDeleteCustomer` acepta `onBusinessBlock`). El saldo mostrado usa `outstanding_revenue` canónico.
- Pruebas: `supabase/tests/r_fix37_customer_outstanding_archive_smoke.sql` (catálogo + comportamiento, con ROLLBACK) y `CustomerDeleteDialog.test.tsx` (mapeo del bloqueo, copia canónica, carrera).

## [7.382.0] - 2026-08-30

### Fix (P2 integridad): el archivado de mantenimientos pasa siempre por el RPC canónico

- Nueva función `public.guard_maintenance_archive()` (SECURITY DEFINER, `SET search_path = public`) y trigger `trg_guard_maintenance_archive` (BEFORE UPDATE OF `deleted_at` en `public.maintenance_logs`): sólo actúa en la transición `deleted_at IS NULL -> NOT NULL` y rechaza con 42501 (`El archivado de mantenimientos solo procede por soft_delete_maintenance_log`) cualquier UPDATE directo.
- Decisión: **forzar el RPC** en vez de espejear reglas. `soft_delete_maintenance_log` tiene efectos colaterales (regla de OT cerrada sólo-admin y limpieza de `maintenance_parts`/`maintenance_labor` de OT abiertas, con devolución de inventario y recálculo de costo por trigger); duplicarlos en un guard habría creado dos definiciones divergentes.
- `soft_delete_maintenance_log` conserva su semántica intacta; sólo marca la transacción con `app.maintenance_archive_rpc = 'on'` (local) alrededor del UPDATE.
- Sin bypass para `service_role` ni para admin por SQL directo: la integridad manda. Sólo `app.e2e_seed = 'on'` queda exento, como el resto de guards del repo. `EXECUTE` del guard revocado a `anon`/`authenticated`.
- Sin cambios en transiciones de estado de OT, costos, inventario, daños, permisos, desarchivado ni ediciones ordinarias. La UI ya usaba el RPC: no requiere cambios.
- Pruebas: `supabase/tests/r_fix36_maintenance_archive_guard_smoke.sql` (catálogo + comportamiento, transacción con ROLLBACK).

## [7.381.1] - 2026-08-30

### Fix (UX): bloque explicable ante rechazo por carrera del guard de asignación de venta

- `useCreateInvoice` ahora acepta `onBusinessBlock` (convención de fase 1/2); `useInvoiceFormSubmit` y `useInvoiceFormLogic` lo cablean sólo para el código `quote_sale_assignment_incomplete`.
- Si `trg_guard_invoice_sale_assignment` rechaza el INSERT por carrera/estado obsoleto, el formulario reusa la pantalla existente `SaleAssignmentBlocked` en vez del toast genérico de error.
- Sin cambios en SQL, reglas de negocio ni en la prevención determinística de la UI; los demás errores de facturación conservan su toast estándar.
- Prueba de regresión: `useCreateInvoice.businessBlock.test.tsx` (bloque entregado + toast suprimido; errores no relacionados intactos).

## [7.381.0] - 2026-08-30

### Fix (P1-B integridad): guard de asignación completa para facturar cotizaciones de venta

- Nueva función `public.quote_sale_units_unassigned(uuid)` (SECURITY DEFINER, `SET search_path = public`): espejo exacto de `useQuoteSaleAssignmentStatus` — partida de venta = descripción que termina en `- Venta de equipo`; requerido = `quantity` (0/NULL => 1); asignado = filas de `quote_assigned_forklifts` con ese `line_index`. `EXECUTE` revocado a `anon`/`authenticated`.
- Nueva función `public.guard_invoice_sale_assignment()` y trigger `trg_guard_invoice_sale_assignment` (BEFORE INSERT en `public.invoices`): si la factura referencia una cotización con partidas de venta incompletas, rechaza con P0001 indicando cuántas unidades faltan. Cubre todas las rutas de alta (UI, RPC, edge functions, SQL directo).
- Sin cambios para facturas sin `quote_id`, cotizaciones de renta ni cotizaciones totalmente asignadas. El guard no muta asignaciones ni el estatus de las unidades.
- `service_role`/tareas internas también quedan sujetas a la regla (es invariante de integridad); sólo `app.e2e_seed = 'on'` está exento, como el resto de guards del repo.
- `businessBlocks`: nuevo código `quote_sale_assignment_incomplete` con la copia canónica; el rechazo del backend por carrera/estado obsoleto se explica igual que la prevención de la UI (`SaleAssignmentBlocked`).
- Pruebas: `supabase/tests/r_fix35_invoice_sale_assignment_guard_smoke.sql` y `src/lib/rules/__tests__/invoiceSaleAssignmentGuard.test.ts`.

## [7.380.0] - 2026-08-30

### Fix (P1 integridad): guard de archivado de clientes en la BD

- Nueva función `public.guard_customer_archive()` (SECURITY DEFINER, `SET search_path = public`) y trigger `trg_guard_customer_archive` (BEFORE UPDATE OF `deleted_at` en `public.customers`): sólo actúa en la transición `deleted_at IS NULL -> NOT NULL`. Rechaza con 42501 si quien archiva no es `admin`/`administrativo` (ventas incluido, pese a la policy amplia) y con P0001 si el cliente tiene reservas activas.
- Nuevo helper `public.customer_has_active_bookings(uuid)` con la definición canónica de reserva activa (`confirmed`, `in_progress`); `soft_delete_customer` lo reutiliza para evitar lógica duplicada. `EXECUTE` revocado a `anon`/`authenticated`.
- El saldo pendiente NO se convierte en regla de base de datos: sigue siendo advertencia/bloqueo de UI (decisión de producto separada).
- Desarchivar (`deleted_at` -> NULL) y las ediciones normales de clientes quedan sin cambios. Sin sesión (service_role/tareas) y con `app.e2e_seed = 'on'` el guard no interviene.
- Pruebas: `supabase/tests/r_fix34_customer_archive_guard_smoke.sql` (catálogo + comportamiento por rol, transacción con ROLLBACK).

## [7.379.0] - 2026-08-29

### Fix (P0 integridad): guard de borrado de pagos a proveedor en la BD

- Nueva función `public.guard_supplier_payment_delete()` (SECURITY DEFINER, `SET search_path = public`) y trigger `trg_guard_supplier_payment_delete` (BEFORE DELETE en `public.supplier_payments`): rechaza el borrado si `rep_status = 'received'` (P0001), si la factura de proveedor está `cancelled` (P0001) o si el usuario no es `admin` (42501).
- Convención preservada: sin sesión (`auth.uid() IS NULL`, service_role/tareas) y con `app.e2e_seed = 'on'` el guard no interviene, igual que `validate_prospect_close()`.
- `businessBlocks`: los mensajes del guard se mapean a `supplier_payment_rep_received` y `supplier_bill_cancelled`; `useDeleteSupplierPayment` acepta `onBusinessBlock` y `useSupplierPaymentActions` muestra el bloqueo del servidor con la misma copia que la prevención en UI.
- Sin cambios en cálculos de saldo, emisión/recepción de REP, conciliación bancaria (`ON DELETE SET NULL` intacto) ni en la máquina de estados de facturas de proveedor.
- Pruebas: `supabase/tests/r_fix33_supplier_payment_delete_guard_smoke.sql` (catálogo + comportamiento real por rol) y `src/lib/rules/__tests__/supplierPaymentDeleteGuard.test.ts`.

## [7.378.0] - 2026-08-29

### Feature: bloqueos de negocio explicables (lote 3, solo presentación)

- `businessBlocks`: nuevos códigos `supplier_bill_pending_approval`, `supplier_payment_rep_received`, `payment_rep_stamped_locked`, `portal_payment_fully_reported`, `damage_not_repaired`, `prospect_stage_not_negotiation`, `quote_expired` y `quote_already_converted`, más el patrón de error para el cierre de prospecto fuera de Negociación.
- CxP: `supplierBillPaymentBlock` explica "Registrar pago" bloqueado (pagada, cancelada, pendiente de aprobación, rechazada) con las mismas condiciones que ya deshabilitaban el botón; eliminar pago de proveedor con REP recibido usa el bloque compartido.
- Facturas: el candado por REP timbrado (columna de pagos y `EditPaymentDialog`) se unifica en `payment_rep_stamped_locked`, sin tocar timbrado ni cancelación.
- Daños: `damageArchiveBlockReason` devuelve el bloque explicable con la condición real (`invoice_id` o `repaired`); "Archivar" queda visible y deshabilitada.
- CRM: cerrar como Ganado fuera de Negociación se explica con el bloque compartido; la denegación por rol sigue en `RoleGuard`.
- Cotizaciones: "Aceptar" vencida y "Ya convertida a Reserva" usan el patrón compartido; se agrega "Ver reserva" reutilizando la relación ya cargada (sin consultas nuevas).
- Portal: reportar pago con saldo reportable en cero se explica; la condición técnica (datos del cliente aún cargando) se mantiene aparte.
- Sin cambios en SQL, RLS, RPC guards, máquinas de estado, lógica fiscal ni permisos.

## [7.377.0] - 2026-08-29

### Feature: bloqueos de negocio explicables (fase 2, solo UX/contrato de error)

- `businessBlocks`: nueva `describeForkliftRentalBlock(targetStatus)` — una sola regla canónica de renta activa con título contextual (vender / dar de baja / mantenimiento / disponible); motivo y siguiente paso alineados a la devolución pendiente. `StatusChangeCard` la usa tanto en la prevención en UI como al mapear el rechazo del RPC.
- `InvoiceDetailActions`: `invoice_stamped_locked` conectado — con permiso `Facturas: full`, Editar queda visible y deshabilitado en facturas timbradas (antes se ocultaba). `invoice_cancellation_pending` sustituye el tooltip ad-hoc del botón "Registrar pago" bloqueado.
- `useRecordPaymentForm` / `RecordPaymentDialog`: `payment_exceeds_balance` conectado — el sobrepago se explica junto al monto y deshabilita el submit (misma regla BL-11, sin duplicar el cálculo de saldo); el rechazo del backend por carrera se mapea con `resolveBusinessBlock` en vez de un toast técnico.
- `BookingExtensionsCard`: `extension_already_billed` conectado — "Facturar extensión" se muestra deshabilitada con el motivo y se conserva "Ver factura" (ahora vía `ROUTES.invoices.detail`).
- Sin cambios en SQL, RLS, RPC guards, máquinas de estado, lógica fiscal ni permisos.
- Pruebas: `useRecordPaymentForm.blocks.test.ts`, `BookingExtensionsCard.test.tsx` y cobertura contextual en `businessBlocks.test.ts`.

## [7.376.0] - 2026-08-29

### Feature: bloqueos de negocio explicables (fase 1, solo UX/contrato de error)

- Nuevo `src/lib/rules/businessBlocks.ts`: catálogo tipado de bloqueos (`action` / `reason` / `nextStep` / `tone`) y `resolveBusinessBlock(error)`, que se apoya en `translatePgError` (constraint → SQLSTATE → texto) sin duplicar el catálogo de Postgres.
- Nuevos `src/components/feedback/BlockedActionNotice.tsx` (Alert `info`/`warning`, detalle contextual y enlace "Ver…/Resolver…" vía `ROUTES`) y `BlockedActionButton.tsx` (acción visible pero deshabilitada, motivo en tooltip).
- `useEntityMutation`: nueva opción `onBusinessBlock` — si el error corresponde a una regla catalogada, la vista muestra el bloque explicativo y se suprime el toast genérico.
- Flujos convertidos: `StatusChangeCard` (renta activa, con prevención en UI y manejo de carrera desde el RPC), `CloseWorkOrderDialog` (daño abierto + "Resolver daño"), `ContractDetailActions` (contrato firmado/completado), `SupplierBillPaymentActions` + `billPermissions` (pagos, aprobada, rechazada, pagada, cancelada).
- Sin cambios en SQL, RLS, RPC guards, máquinas de estado ni permisos: el backend sigue siendo la autoridad final.
- Pruebas nuevas: `src/lib/rules/__tests__/businessBlocks.test.ts`, `src/components/feedback/__tests__/BlockedAction.test.tsx`, `src/features/accounts-payable/lib/__tests__/billPermissions.test.ts`.

## [7.375.0] - 2026-08-29

### Docs: limpieza extensa de archivos Markdown (157 → 12)

- Eliminados 130 planes archivados (`.lovable/*.md` y `.lovable/plan/*.md`); `.lovable/plan/` se agregó a `.gitignore`. El contenido efectivo de cada plan ya está en este changelog y en el código.
- Eliminados 10 reportes con fecha fija: `docs/coverage-matrix-r2.md`, `docs/dependency-audit.md`, `docs/dependency-update-audit-2026-08-14.md`, `docs/mobile-qa-v6.13.2.md`, `docs/e2e-roadmap.md`, `docs/lighthouse/baseline.md` y toda la carpeta `docs/audits/` (knip, toasts, R4-cierre, H-6).
- Eliminados 5 README de carpeta en `src/` (calendar/lib, operations/hooks, bookings/hooks, quotes/hooks, system/hooks); se conservan `src/components/domain/README.md` y `src/lib/domain/README.md` por contener reglas de decisión reales.
- `architecture.md`: §15 reescrita (suites E2E vigentes, auth por API en `global.setup.ts`, nueva §15.4 de pruebas RLS, Lighthouse sin baseline versionado); §5.2, §20.6 y §24 sin referencias muertas.
- `README.md`: PDF corregido a `@react-pdf/renderer`, nueva sección "Documentación" con los archivos vivos y punteros a `tests/e2e/README.md` y `supabase/tests/rls/README.md`.
- Retirado `scripts/dependency_audit.py` (solo generaba el reporte eliminado) y ajustado el mensaje final de `scripts/lighthouse-baseline.sh`.
- Documentos vivos: `README.md`, `architecture.md`, `CHANGELOG.md`, `docs/architecture-guardrails.md`, `docs/paginacion-cursor.md`, `.github/pull_request_template.md`, 2 README de `src/` y 2 de pruebas.

## [7.374.4] - 2026-08-29

### Fix: sesión expirada ya no termina en "Página no encontrada"

- `sessionExpiry.handleSessionExpired` redirigía a `/auth?redirect=…`, ruta inexistente en el router: sin sesión se veía el login inline, pero tras autenticarse la URL `/auth` caía en el catch-all 404 y el usuario perdía su pantalla. Ahora redirige a `/login?redirect=…`.
- Router: la ruta `/login` pasa de `<Navigate to="/">` a `LoginRedirect`, que honra `?redirect=` (validado: sólo rutas internas que empiezan con "/" y no "//", contra open redirects) y regresa al usuario a la página donde estaba.
- El guard "ya estoy en acceso" de `sessionExpiry` ahora reconoce `/login`.

## [7.374.3] - 2026-08-28

### CI: actions oficiales de GitHub al día

- `actions/checkout` v6 → **v7** (20 usos en `ci.yml`, `codeql.yml`, `bundle-size.yml`, `gitleaks.yml`, `lighthouse.yml`, `rls-db-tests.yml`, `changelog-check.yml`): endurece el manejo de credenciales en PRs de forks; mismas entradas.
- `actions/download-artifact` v6 → **v8** (2 usos en `ci.yml`): requiere `upload-artifact` v6+, ya estábamos en v7.
- `actions/setup-node` v5 → **v7** (`.github/actions/setup-bun-project`): corre sobre Node 24, mismas entradas `node-version`/`cache`.
- Sin cambios: `actions/upload-artifact@v7`, `actions/cache@v6`, `github/codeql-action@v4` (ya en su última major). Las actions de terceros siguen fijadas por SHA vía Dependabot.

## [7.374.2] - 2026-08-28

### Lint: refs en render, no-control-regex y orden de imports

- `useCustomerDetailPage`, `useForkliftFormLogic`, `useInvoiceFormLogic` (react-hooks/refs): los snapshots de bloqueo optimista (`customer.version`, `updated_at`, `invoice.version`) pasan de `useRef` leído/escrito en render a `useState` + efectos (`prev ?? valor` conserva la captura única; el reset por cambio de `id` se mantiene). Mismo comportamiento, patrón compatible con React Compiler.
- `exportCsv` (no-control-regex, único **error** del lint): se reemplaza la regex `/^[\s\u0000-\u001F]*[=+\-@]/` por comparación de caracteres (`startsWithFormula`), misma cobertura anti CSV-injection.
- `DeliveriesPage`, `MaintenancePoliciesTab` (max-lines) y `MaintenanceDetailSheet` (complexity 16→~11): se extraen `buildDeliveryColumns`, `DeliveryMobileCard`, `PolicyMobileCard` y `MaintenanceDetailActions` sin cambios visuales.
- Orden de imports (`import-x/order`) en `EditPaymentDialog`, `GlobalInvoiceFields`, `useInvoiceFormSubmit` e `InvoiceForm`.

## [7.374.1] - 2026-08-28

### Fix CI: teardown E2E y prueba del pagaré

- `e2e_teardown` / `e2e_seed_portal_scenario`: se elimina el `DELETE FROM storage.objects` (la plataforma lo bloquea con "Direct deletion from storage tables is not allowed"), que hacía fallar 6 pruebas E2E. La limpieza de objetos huérfanos debe hacerse vía Storage API.
- `contractPlaceholders.test.ts`: la prueba esperaba 5% cuando el contrato tiene 0%; desde G-A3 un 0% explícito se respeta. Se separa en dos casos (0% explícito vs. tasa inválida).

## [7.374.0] - 2026-08-28

### Ronda G (cierre final): guard de cierre de deals y avisos de TC en CxP

- `validate_prospect_close()` (G-C2): guard de rol en la base de datos para `cerrado_ganado` (`has_role((select auth.uid()), 'admin'|'administrativo')`, `ERRCODE = insufficient_privilege`). El rol `ventas` tiene `FOR ALL` sobre `prospects`, así que la regla del cliente (`useProspectGuard`) se podía rodear llamando a la API. Se respeta `app.e2e_seed` y se conserva `SET search_path = public`.
- `pgErrorCatalog` (G-C2): mensaje prioritario en español para el nuevo error de cierre no autorizado.
- `CuentasPorPagarPage` (G-B6): aviso con `fxMissingCount` — paridad con el reporte de antigüedad; los KPIs ya excluían esas facturas pero sin explicarlo.
- `PaymentsExportTable` (G-B5): badge "Sin TC" en el saldo de facturas en divisa sin tipo de cambio.
- `supabase/tests/g_c2_prospect_close_role_smoke.sql`: smoke del guard de rol.

## [7.373.2] - 2026-08-28

### Ronda G (cierre): CxP multimoneda y expiración de sesión

- `RegisterSupplierPaymentDialog` / `SupplierBillDetailContent` (G-B1): el saldo se formatea con `formatCurrencyWithCode` y la moneda real de la factura; antes una factura en USD mostraba el saldo como pesos y se dispersaba el monto equivocado.
- `PaymentsExportTable` (G-B2): columna "Saldo" con código de moneda y badge para no-MXN en lotes mixtos.
- `useExportablePayables` (G-B5): se agrega `exchange_rate` al SELECT para poder detectar tipos de cambio faltantes.
- `lib/auth/sessionExpiry` + `AppProviders` (G-C3): un 401/`PGRST301` ahora ejecuta `signOut()` y redirige a `/auth?redirect=…` una sola vez; antes solo aparecía el toast "Tu sesión expiró" y la pantalla quedaba inservible hasta recargar a mano.

## [7.371.0] - 2026-08-28

### Ronda F: portal del cliente y PDFs fiscales

- `PortalQuotes` / `PortalQuoteDetail` / `TotalsBreakdown` (F2): `formatCurrencyWithCode` con `quote.currency`; antes toda cotización se formateaba en MXN aunque estuviera en USD y el cliente podía aceptarla creyendo un monto ~18x menor.
- `portalKpis.derivePortalKpis` (F1): usa `toMxn(balance, moneda, tipo_cambio)` + `sumMoney` en vez de multiplicar siempre por `tipo_cambio`. Elimina la divergencia entre el saldo del tablero y el del estado de cuenta.
- `fetchInvoicePdfData` / `buildInvoicePdf` (F3): `receptor_razon_social` y `receptor_domicilio_fiscal_cp` (snapshot fiscal al emitir) son la fuente primaria; el JOIN vivo a `customers` queda como respaldo y usa `maybeSingle()`.
- `PortalSections` / `PortalUpcomingDues` (F4): enlace "Ver todas (N)" cuando la lista se recorta a 5.

## [7.370.0] - 2026-08-28

### Ronda E: archivado de OT, drift monetario y guardas de UI

- `soft_delete_maintenance_log` (E1): una OT `completed` solo la archiva `admin` y ya NO se borran `maintenance_parts` / `maintenance_labor` de órdenes cerradas (era pérdida de historial de costos). Las órdenes abiertas siguen limpiando sus renglones. `MaintenanceDetailSheet` deshabilita "Archivar" para no-admin en OT cerradas.
- `InvoiceDetail` / `paymentCurrency` (E2): `sumMoney` para pagos y notas de crédito, `roundMoney` para el saldo. Elimina el drift IEEE-754 que mostraba saldo residual en facturas totalmente pagadas.
- `CustomerDetailPage` (E3): rama `isError` con `QueryErrorState` + reintentar; antes un fallo de red/RLS se veía como "Cliente no encontrado".
- `MaintenancePolicyForm`, `CreateCreditNoteDialog`, `RegisterSupplierPaymentDialog` (E4): `isDirty` conectado a `FormDialog` para confirmar antes de descartar cambios.
- `useCRMMetrics` (E5): nuevo helper `toMty()` en `src/lib/utils.ts`; los cortes MTD/30d comparan fechas de cierre en la misma escala (America/Monterrey).

## [7.369.1] - 2026-08-28

### Ronda R6 (fix-35): limpieza E2E incompleta (R6-18)

- `e2e_seed_portal_scenario` y `e2e_teardown`: DELETE de `public.credit_notes` por `invoice_id`/`customer_id` E2E antes de borrar `invoices`/`customers`. La FK `credit_notes_invoice_id_fkey` es ON DELETE RESTRICT y las NC no llevan `is_e2e`, así que el teardown fallaba con 23503 y dejaba datos de prueba residuales.
- Ambas funciones borran los objetos huérfanos `payment-proofs/<customer_id>/%` de `storage.objects` (usando `EXISTS ... LIKE` en vez del `LIKE ANY (SELECT array_agg(...))` del parche).
- `e2e_teardown` reporta los conteos `credit_notes` y `storage_objects`.
- Se conservan guard de rol admin, `SET search_path = public`, validación `allow_e2e_seed`, la regla de no reasignar roles ajenos y los permisos (`REVOKE` a anon / `EXECUTE` a authenticated). `auth.uid()` envuelto en `(select auth.uid())`.

## [7.369.0] - 2026-08-28

### Ronda R6 (fix-34): candados optimistas y falsos conflictos

- `useCustomerDetailPage`: snapshot de `customer.version` al abrir el diálogo de edición (`useRef` + `setEditOpen` envuelto). Antes se pasaba la versión viva de React Query y un refetch con el diálogo abierto neutralizaba el candado → lost update (R6-06).
- `useUpdateCustomer`: el probe compara `still.version !== expectedVersion`; si coincide, el 0-filas viene de RLS/permisos y ya no se reporta un falso `stale_write` (R6-11).
- `useUpdateForklift`: el probe selecciona `updated_at` y lo compara con el snapshot en vez de solo comprobar existencia (R6-12).
- `useForkliftFormLogic`: `expectedUpdatedAt` congelado al cargar el registro y reseteado al cambiar el `id` de ruta (R6-12).
- `useInvoiceFormLogic`: reset de `invoiceVersionRef` en `useEffect` sobre `id` (navegar de /invoices/A/edit a /invoices/B/edit no remonta el form) y nuevo `setInvoiceVersion` + `existing` / `isLoadingInvoice` expuestos (R6-19, R6-13, R6-25).
- `InvoiceForm`: tras `updateInvoice` se actualiza el snapshot con `data.version` antes de `syncInvoiceBookings`, para que reintentar Guardar no choque contra la propia escritura (R6-13); y en modo edición con id inexistente o sin permisos se muestra `EmptyState` con salida a /invoices en vez del form vacío cargando indefinidamente (R6-25).
- Verificación: 317 pruebas de facturas/clientes/flota en verde y typecheck limpio.

## [7.368.0] - 2026-08-28

### Ronda R6 (fix-33): cola de reintentos CFDI

- Migración: `cfdi_retry_queue.deferrals integer not null default 0` — contador real en vez del truco de prefijo `[deferrals=N]` en `last_error` que proponía el parche (R6-02).
- `process-cfdi-retry-queue`: tope `MAX_DEFERRALS = 10`; superado, la fila pasa a `exhausted` con diagnóstico. Antes `attempts` quedaba congelado y `max_attempts` nunca se alcanzaba → bucle infinito contra el PAC (R6-02).
- Backoff creciente con `nextRetryAt(deferrals)` (2, 4, 8… min, tope 60) en vez del `next_retry_at` fijo de ~2 min (R6-22).
- Nuevo `isDocCancelled()`: tras el refresh se relee `invoices` / `credit_notes` / `payments` y, si la cancelación quedó confirmada, la fila se cierra como `succeeded` (R6-03).
- `refresh-cancellation-status`: `AbortSignal.timeout(10_000)` y logs de warning en respuesta no-OK y en excepción (antes `catch {}` vacío) (R6-23).
- `cancel` (facturas) entra al camino de deferral, pero **solo** cuando el 409 trae `code: "CANCELLATION_IN_PROGRESS"` (nuevo en `cancel-cfdi/handler.ts`). El 409 de `assert_invoice_cancellable` (factura no cancelable) sigue siendo terminal — el parche original los mezclaba y habría reintentado 10 veces una factura con pagos aplicados (R6-08, ajustado).
- `deferrals` se reinicia a 0 al cerrar la fila o al consumir un intento real.
- Tests: 5 casos nuevos en `supabase/functions/process-cfdi-retry-queue/index_test.ts` (13 pasando).

## [7.367.0] - 2026-08-28

### Ronda R6 (fix-32): portal de pagos, conciliación y storage

- `approve_payment_intent`: `SELECT ... FOR UPDATE` de la factura (dos aprobaciones concurrentes podían sobrepasar el saldo), conversión FX de `payments` con el mismo `CASE` que `sync_invoice_status_from_payments`, descuento de intents `pending_review`, criterio canónico de NC (`stamped` + `status <> 'cancelled'` + `cancellation_status IS DISTINCT FROM 'accepted'`) y pago insertado con `exchange_rate = NULL` (R6-04).
- `validate_payment_intent_amount`: lee `moneda`/`tipo_cambio` y suma los pagos convertidos; en facturas en divisa el saldo disponible ya no se calculaba 1:1 (R6-09).
- `confirm_bank_match` y `get_bank_match_candidates`: `LEFT JOIN invoices` + fallback `COALESCE(NULLIF(p.exchange_rate,0), NULLIF(i.tipo_cambio,0))` (R6-10).
- Policy INSERT de `customer_payment_intents`: excluye facturas `cancelled`/`draft` o con cancelación aceptada y exige `(storage.foldername(proof_url))[2] = invoice_id` (R6-15).
- Policy DELETE de `storage.objects` (`payment-proofs`): el `NOT EXISTS` de intents ya procesados sale del `OR` de roles, así admin/administrativo tampoco borran evidencia aprobada (R6-14).
- Policy INSERT de `storage.objects`: se elimina `COALESCE(metadata->>'mimetype','application/pdf')`; el mimetype declarado es obligatorio (R6-24).
- Bucket `payment-proofs`: privado y con límite de 10 MB (R6-05). Nota: se configuró con la herramienta de storage, no por SQL (`INSERT INTO storage.buckets` está prohibido y además el bucket ya existía, por lo que el `ON CONFLICT DO NOTHING` del parche no habría hecho nada).
- Nuevo smoke `supabase/tests/r_fix32_portal_pagos_smoke.sql` (15 verificaciones).

## [7.366.0] - 2026-08-28

### Ronda R6: triggers de facturación, pagos en divisa y bypass GUC

- `sync_invoice_status(uuid)`: nuevo helper; `sync_invoice_status_from_credit_notes()` llamaba a la función _trigger_ de pagos fuera de contexto (`trigger_protocol_violated`) (R6-01).
- `trg_sync_invoice_from_credit_notes`: ahora también dispara con `cfdi_status` y `cancellation_status`.
- `trg_payment_amount_mxn()`: permite el cruce divisa→MXN cuando hay TC (pago o factura); sólo falla si no hay ninguno (R6-07).
- `trg_payments_currency_matches_invoice`: `UPDATE OF currency, invoice_id, exchange_rate, amount` (R6-16).
- `sync_forklift_rental_status`, `cancel_booking`, `create_booking`, `complete_return_inspection`, `e2e_seed_portal_scenario`: `EXCEPTION WHEN OTHERS` + reset de `app.forklift_rpc` / `app.booking_rpc` / `app.e2e_seed` + `RAISE` (R6-17).
- `get_financial_kpis`: `expiring_contracts` excluye clientes E2E y unidades borradas con `(f.id IS NULL OR f.deleted_at IS NULL)` para no perder contratos sin unidad; se **conserva** la conversión a MXN del MRR (FIX A4) que el parche original revertía (R6-20).
- `get_dashboard_stats`: `invoice_stats.breakdown` suma en MXN; se **conserva** `v_invoice_forklift_revenue` en `utilization` (FIX A1) (R6-21).
- Nuevo smoke `supabase/tests/r_fix31_triggers_smoke.sql`.

## [7.365.1] - 2026-08-27

### Fix: `audit_trigger_fn()` insertaba `is_e2e` NULL

- `current_setting('app.e2e_seed', true)` devuelve NULL fuera de sesiones E2E; `false OR NULL = NULL` dejaba `v_is_e2e` en NULL y el INSERT violaba el NOT NULL de `audit_logs.is_e2e` (SQLSTATE 23502).
- Rompía `supabase db start` en CI (seed.sql sobre `company_settings`) → 0/21 suites SQL smoke.
- Todos los predicados del trigger van ahora envueltos en `coalesce(..., false)`; `v_source` con `coalesce(..., 'system')`.

## [7.365.0] - 2026-08-27

### Ronda D de auditoría: truncamiento, monedas y drift de centavos

- `useDamageRecords`: `.limit(LIST_FETCH_LIMIT)` — la lista de daños se truncaba en 1000 filas sin aviso y subestimaba los costos en reportes (D1).
- `useReconciliationData`: `.limit(LIST_FETCH_LIMIT)` en la consulta de conciliación fiscal; el total timbrado y los huecos de folio quedaban incompletos en rangos amplios (D2).
- `usePaymentHistoryColumns`: `formatCurrencyWithCode(amount, currency)` en vez de `formatCurrency` (un pago USD se formateaba con reglas MXN) (D2).
- `MaintenancePartsSection` y `WorkOrderCloseSummary`: sumas con `sumMoney`/`roundMoney` para evitar drift IEEE-754 en costos de OT (D3).
- `RentalFinancialSummary`: usa la moneda de la reserva; si las tarifas no son MXN, el "Balance Restante" ya no compara 1:1 contra lo facturado en pesos. "Revenue Esperado" → "Ingreso Esperado" (D4).
- `PartDetailSheet`: fechas con `formatDateTimeMty` en lugar de `date-fns` con TZ del navegador.

## [7.364.0] - 2026-08-27

### Bitácora: origen de cada movimiento (usuario / sistema / prueba)

- `audit_logs`: columnas `is_e2e` y `source`, índice parcial para la lista sin pruebas.
- `audit_trigger_fn()`: marca sesiones E2E aunque la tabla no tenga `is_e2e`; `source = 'system'` para movimientos sin usuario o con `app.audit_source = 'system'`.
- `purge_e2e_audit_logs()`: RPC admin que borra solo filas `is_e2e = true` (usa `app.audit_maintenance`).
- Bitácora: filtro "Origen", badges "Sistema"/"Prueba" y botón de purga para admin.

## [7.363.0] - 2026-08-27

### Entregas atrasadas visibles y fechas con reloj de Monterrey

- Entregas: badge "Vencida · N días" y aviso resumen de entregas programadas fuera de fecha (C2).
- Entregas: columna "Tipo" en escritorio y filtros de búsqueda, estado y tipo con `useTableFilters` (C2).
- CRM: `useCRMMetrics` usa `nowMty()` para los cortes MTD y 30 días (C3).
- Pagos (cliente y proveedor) y factura global: validación de "no futuro" con `nowMty()` (C4).

## [7.362.0] - 2026-08-27

### Cierre de auditoría: errores de carga visibles, saldos por moneda y facturas sin vencimiento

- CRM cerrados: si la consulta falla se muestra el error con reintento en vez de listas vacías (B3).
- Detalle de proveedor: aviso de listas truncadas sobre los totales de gastos y mantenimiento (B5).
- Detalle de factura: pagos normalizados a la moneda del documento y aviso de pagos sin tipo de cambio (B6).
- Estado de resultados: gastos de proveedor convertidos a MXN y sin incluir borradores (A3).
- MRR y KPIs financieros: rentas en divisa convertidas a MXN (A4).
- Antigüedad de saldos / Cuentas por pagar: bucket y marca "Sin vencimiento" (A7).

## 7.359.3 - 2026-08-27

**Pruebas E2E: el seeding ya no se apaga a media corrida**

- `tests/e2e/fixtures/seed.ts` reintenta el seeding tras re-habilitar `allow_e2e_seed` si el RPC responde "seeding disabled".
- `tests/e2e/global.teardown.ts` no apaga el interruptor en corridas por shards (`--shard` o `E2E_KEEP_SEED_FLAG=1`).

## 7.359.2 - 2026-08-27

**Datos de prueba: el interruptor de seeding queda apagado (fix-29 / R5-07)**

- R5-07: `allow_e2e_seed` queda en `false` en el entorno actual; el valor por defecto para entornos nuevos ya era `false`.
- El teardown de las pruebas E2E vuelve a apagar el interruptor al terminar la suite, aunque falle la purga de datos de prueba.

## 7.359.1 - 2026-08-27

**Edición de facturas: bloqueo optimista más confiable (fix-30)**

- R5-09: la versión de la factura se congela al abrir el formulario, así un refresco en segundo plano ya no permite pisar cambios de otra persona.
- R5-16: en edición, el botón Guardar queda deshabilitado ("Cargando la factura…") hasta que la factura termina de cargar.
- R5-17: el mensaje "otro usuario modificó esta factura" solo aparece cuando la versión realmente cambió; si fue un tema de permisos, se muestra el error correcto.
- R5-18: el seed de desarrollo distingue entre un correo que no existe (aviso) y un usuario que ya era administrador (nota informativa).

## 7.359.0 - 2026-08-27

**Portal de clientes: comprobantes más seguros y sin sobrepagos por reportes simultáneos (fix-29)**

- R5-06: la limpieza del escenario de pruebas del portal ya no borra pagos ni reportes de pago de facturas reales del cliente.
- R5-08a: al reportar un pago, el comprobante debe estar en la carpeta del propio cliente.
- R5-08b: borrar un comprobante propio pendiente ya no se bloquea por reportes de otros clientes.
- R5-12: se bloquea la factura al validar el monto, así dos reportes simultáneos no pueden exceder el saldo.
- R5-19: sólo se aceptan comprobantes PDF, PNG, JPEG o WebP; el bucket sigue privado y con límite de 10 MB.
- R5-07 descartado: apagar `allow_e2e_seed` globalmente rompería CI; el valor por defecto para entornos nuevos ya es `false`.

## 7.358.0 - 2026-08-27

**Indicadores financieros y tablero sin datos de prueba ni mezcla de monedas (fix-28)**

- R5-03: los KPIs financieros (MRR, DSO, vencido) ya no incluyen registros de prueba ni unidades eliminadas.
- R5-04: una factura con pago parcial ya puede pasar a "pagada" al completarse el saldo.
- R5-05: si falla revertir un cambio desde la bitácora, el permiso interno de reversión se apaga siempre en vez de quedar activo.
- R5-10: en el flujo de efectivo, las notas de crédito en dólares se convierten a pesos con el tipo de cambio de su factura y solo cuentan las vigentes (timbradas, no canceladas y sin cancelación aceptada); se excluyen las de facturas de prueba.
- R5-11: el ingreso por unidad en el ranking de utilización también se convierte a pesos.

## 7.357.0 - 2026-08-27

**Pagos en otra moneda con tipo de cambio y estados correctos con nota de crédito parcial (fix-27)**

- R5-01: se permite registrar un pago en moneda distinta a la de la factura cuando hay tipo de cambio (en el pago o en la factura); sin tipo de cambio se sigue rechazando.
- R5-15: con nota de crédito parcial y sin pagos, una factura pagada pasa a "vencida" si ya venció (antes siempre a "enviada") y el resto de los casos pasa a "parcial".
- R5-02: un 409 al cancelar notas de crédito o complementos de pago ya no marca la fila como fallo terminal; se reprograma sin gastar intentos y se consulta el estado real en el SAT.
- R5-13: al liberar el apartado de cancelación de una factura solo se toca si sigue en "pendiente", para no pisar un estado ya reconciliado.
- R5-14: si falla la construcción del cliente del PAC, el apartado de cancelación ya se libera correctamente.

## 7.356.1 - 2026-08-27

**Se restaura la suite E2E en CI**

- Las pruebas E2E fallaban con "E2E seeding disabled on this environment": el permiso de datos de prueba quedó apagado tras R4-21.
- `tests/e2e/global.setup.ts` ahora habilita `allow_e2e_seed` con la sesión admin antes de correr la suite.
- El valor por defecto para entornos nuevos sigue siendo `false`.

## 7.349.0 - 2026-08-26

**Bitácora, portal de clientes y control de acceso (fix-17 / fix-18)**

- N-18: revertir un cambio desde la bitácora ya verifica que el registro no se haya modificado después; si hubo cambios posteriores se rechaza con un mensaje claro en vez de pisarlos en silencio.
- N-31: ya no se puede invitar al portal a un cliente archivado; al archivarlo se desvincula su cuenta del portal y deja de ver su registro.
- N-34: el diálogo de registrar pago avisa en español si la fecha es anterior a la emisión de la factura, en vez de mostrar el error crudo de la base.
- N-36: extender una renta ya no se bloquea por órdenes de mantenimiento archivadas, apenas agendadas o canceladas; solo cuentan las que representan trabajo real.
- N-40: la lectura del horómetro en entregas no puede ser menor a la última registrada de esa unidad; la regla ahora vive también en la base de datos.
- N-45: un usuario desactivado pierde el acceso de inmediato (antes conservaba permisos hasta que caducaba su sesión). Los usuarios sin perfil se consideran activos.
- N-30: si falla la asignación de rol o el perfil al invitar a un usuario interno, la cuenta a medias se elimina automáticamente.
- Descartados por ya estar resueltos o ser inocuos: N-17 (la policy de dispatchers sobre la bitácora ya no existe), N-26 (el bloqueo de campos de contratos firmados ya está cubierto) y N-22 (condición equivalente en depreciación).
- Nueva prueba de humo SQL: supabase/tests/r_fix17_18_smoke.sql.

## 7.348.0 - 2026-08-26

**Panel y reportes financieros (fix-16)**

- N-14: el Panel vuelve a mostrar la utilización por unidad y las alertas de mantenimiento próximo (7 días); antes esas tarjetas siempre salían vacías porque el backend no enviaba los datos.
- N-16: los conteos de flota (disponibles, rentados, en mantenimiento, retirados) ya no se traslapan y suman el total real; además las cifras del Panel excluyen los registros de prueba.
- N-15: la Cartera Vencida deja fuera las facturas en divisa sin tipo de cambio y avisa cuántas quedaron sin incluir.
- N-19: al convertir un pago a pesos manda el tipo de cambio del pago y, si no hay, el de la factura; antes el Panel y el reporte de ingresos daban cifras distintas para el mismo pago.
- N-20: el reporte de ingresos por mes ya no cuenta 1 a 1 los pagos en divisa sin tipo de cambio; ahora los marca como faltantes de tipo de cambio.

## 7.347.0 - 2026-08-26

**Cancelaciones ante el SAT y conciliación de timbrado (fix-15)**

- N-49: la cancelación de un complemento de pago (REP) ahora se aparta antes de llamar al PAC; dos clics simultáneos ya no mandan dos cancelaciones al SAT y el estado (motivo, sustitución y razón) queda guardado.
- N-27: los REP con cancelación pendiente ya se pueden refrescar desde el PAC y solo se marcan como cancelados cuando el SAT lo confirma.
- N-28: las notas de crédito usan el mismo apartado atómico antes de cancelar; si el PAC falla o no responde, el apartado se libera para permitir el reintento.
- N-29: la conciliación automática de timbrado aparta cada documento (facturas, REP y notas de crédito) para que dos ejecuciones del proceso no dupliquen consultas al PAC.
- N-32: no se puede sobrescribir un REP de proveedor ya validado sin confirmarlo explícitamente, y el UUID duplicado se rechaza con un mensaje claro.
- Base de datos: nuevas columnas de seguimiento de cancelación en pagos y restricción única del UUID de REP en pagos a proveedores.

## 7.346.0 - 2026-08-26

**Facturación recurrente, devoluciones y descargas de CFDI (fix-13 / fix-14)**

- N-7a: la última factura recurrente de un contrato se corta en la fecha de fin y se prorratea con la misma fórmula que el primer ciclo, en vez de cobrar el mes completo.
- N-7c: una tarifa pactada de $0 (cortesía) ya se respeta; antes se caía a la tarifa de lista del montacargas.
- N-12: la bolsa de horas del contrato se calcula con meses de calendario reales y prorrateo del remanente, en lugar de redondear días entre 30 (que inflaba la bolsa en meses de 31 días).
- N-13: la inspección de retorno registra los días de retraso y un cargo sugerido por devolución tardía (informativo, no se factura solo).
- N-35: el prellenado de daños en facturas usa el costo real cuando ya existe, no el estimado.
- N-8: el portal del cliente ya puede descargar sus CFDI: el rol cliente está autorizado con verificación de propiedad en facturas, notas de crédito y REP.
- N-9: los archivos de proveedores se abren con enlaces firmados de corta duración generados al momento, en vez de URLs de 5 años; se mantiene compatibilidad con los enlaces antiguos.
- N-10: si falta la llave del PAC, el retimbrado se pospone en vez de intentarse y arriesgar documentos duplicados.
- N-11: se puede volver a cancelar un CFDI rechazado o vencido, y las cancelaciones huérfanas de más de 72 horas se reinician.
- N-44: los nombres de archivo de descarga se sanitizan y las descargas de CFDI tienen límite de 30 solicitudes por minuto.
- N-37 descartado: la corrección propuesta para rentas ancladas al día 31 regresaba el comportamiento ya validado (31 ene → 1 mar) y encarecía el cobro; se conserva la lógica actual.
- Nueva prueba de humo SQL: supabase/tests/r_fix13_devoluciones_smoke.sql.

## 7.345.0 - 2026-08-26

**Integridad de estatus de unidades rentadas (N-6, N-38, N-39, N-41, N-42)**

- N-6: una unidad con renta vencida sin devolución registrada ya no se puede reservar ni aparece como disponible; antes sólo se revisaba el traslape de fechas.
- N-41: cancelar/eliminar otra reserva y la sincronización de flota ya no bajan a "disponible" una unidad que sigue con el cliente.
- N-42: cualquier salida de "rentada" (disponible, mantenimiento, fuera de servicio, vendida, baja) exige devolución registrada; se exime el flujo interno (`app.forklift_rpc`).
- N-38: la inspección de devolución bloquea la fila (`FOR UPDATE`), libera sólo si la unidad seguía rentada y registra bitácora sólo si hubo cambio.
- N-39: la entrega completada promueve a "rentada" únicamente desde "disponible" y registra el estatus previo real.
- Nueva prueba: `supabase/tests/r_fix12_unidades_smoke.sql`.

## 7.344.0 - 2026-08-26

**Conciliación bancaria: tipo de cambio, validación de signo y deduplicación de movimientos (N-4, N-5, N-23, N-24, N-25)**

- N-4: al confirmar una conciliación el importe del pago se convierte a la moneda de la cuenta bancaria; antes se comparaba en crudo y los pagos en moneda extranjera se rechazaban.
- N-5: los candidatos de pago a proveedor se convierten con el tipo de cambio de la factura, igual que el emparejamiento automático.
- N-25: un cargo del banco sólo puede conciliarse con un pago a proveedor y un depósito sólo con un cobro de cliente.
- N-23: el hash de deduplicación incluye la posición de la línea en el archivo (`bank_statement_lines.line_seq`), para no perder movimientos idénticos.
- N-24: las importaciones fallidas o sin movimientos nuevos limpian líneas y encabezado.
- Nuevas pruebas: `bankLineHash.test.ts` y `supabase/tests/r_fix11_conciliacion_smoke.sql`.

## 7.343.0 - 2026-08-26

**Reverso de pagos a proveedor, facturas acreditadas y criterio único de notas de crédito (N-1, N-2, N-3, N-21, N-33)**

- N-3: al eliminar o reversar un pago de una factura de proveedor pagada, el sistema ya puede recalcular su estado a "parcial"; el candado de transiciones de estado todavía la dejaba atorada.
- N-1: una factura cubierta sólo con notas de crédito ya no se marca como "pagada"; se requiere al menos un pago real del cliente.
- N-21: la base de datos usa el mismo criterio que la pantalla para las notas de crédito que descuentan saldo (timbradas, no canceladas y sin cancelación aceptada).
- N-33: el tipo de cambio sólo queda bloqueado si la factura está timbrada o si algún pago tiene REP timbrado.
- N-2: la exigencia de cliente se revisa únicamente al salir de borrador, no en cada actualización interna de estado.
- Nueva prueba de humo SQL (`supabase/tests/r_fix10_finanzas_smoke.sql`).

## 7.342.3 - 2026-08-26

**Datos de prueba con fecha de Monterrey y más cobertura en facturación**

- Los datos de prueba automatizados se fechan con el día vigente en Monterrey; antes usaban la fecha UTC y tras las 18:00 locales la factura quedaba "emitida mañana", lo que hacía que registrar un pago fuera rechazado.
- Nuevas pruebas para catálogos de métodos de pago, motivos de nota de crédito, topes de acreditación y claves de consulta de facturas.

## 7.342.0 - 2026-08-25

**Factura sin cliente bloqueada, notas de crédito sin borradores huérfanos y XML validado (L-1, L-3, L-8, M-17a)**

- L-1: una factura puede guardarse como borrador sin cliente, pero al pasar a cualquier otro estado el sistema exige que tenga cliente asignado y lo avisa con un mensaje claro.
- L-3: si falla el timbrado de una nota de crédito recién creada, el borrador se elimina automáticamente para no dejar registros huérfanos ni consumir folios.
- L-8: los complementos de pago de proveedor se rechazan si el XML viene truncado o con etiquetas desbalanceadas, en vez de leerse a medias.
- M-17a: se agrega un archivo de datos iniciales de demostración para entornos locales y de pruebas.

## 7.336.0 - 2026-08-25

**Reportes financieros con notas de crédito, cobros reales y control de tipo de cambio**

- H-1: el reporte de ingresos por mes descuenta las notas de crédito timbradas y calcula lo cobrado con los pagos reales en lugar del estado de la factura.
- H-2: las facturas en divisa sin tipo de cambio ya no se suman 1 a 1 como pesos; quedan fuera de los totales y se muestra un aviso con cuántas son en Ingresos, Antigüedad de saldos y Pronóstico de cobranza.
- H-2: en el detalle de antigüedad esas facturas se marcan como 'Sin T.C.' para identificarlas y capturarles el tipo de cambio.
- H-3: la utilidad por modelo usa el subtotal sin IVA, deduce notas de crédito y considera las facturas ligadas por el puente de reservas.
- H-4 y M-5: el estado de resultados prorratea la depreciación a 48 meses y la base de efectivo usa la fecha real de los pagos.
- Nuevas pruebas de conversión a MXN para evitar que vuelva la mezcla de monedas en los agregados.

## 7.334.0 - 2026-08-25

**Notas de crédito topadas por complementos de pago (REP)**

- H-5: el máximo acreditable de una factura ahora descuenta los pagos respaldados por un complemento de pago (REP) timbrado y vigente, tanto en la interfaz como en base de datos.
- Los pagos sin complemento timbrado (facturas PUE o capturas internas) y los complementos ya cancelados no limitan la nota de crédito.
- La tarjeta de notas de crédito muestra el desglose del tope (total, notas previas, importe con REP vigente) y lista los complementos que hay que cancelar primero, advirtiendo que el SAT puede tardar hasta 72 horas.
- Cuando hay cobros sin complemento vigente se avisa que la nota de crédito dejará saldo a favor del cliente.
- Nuevas pruebas de máximo acreditable y de pagos con REP, más suite de humo SQL h5_credit_note_rep_smoke.sql.

## 7.333.0 - 2026-08-25

**Timbrado con IVA por línea y candados de integridad fiscal**

- C-1: el timbrado envía a Facturapi la tasa de IVA de cada partida (0%, 8%, 16% o exenta) en lugar de la tasa global de la factura.
- C-1: si el total timbrado difiere del total de la factura por más de un centavo, la factura queda en estado de error y el timbrado responde con falla, pero se conservan el folio fiscal, el XML y el ID de Facturapi para poder cancelar el CFDI.
- C-2: una factura timbrada sin cancelación aceptada ya no permite editar partidas, subtotal, impuestos, tasa, total ni fecha de emisión.
- H-7: una cuenta por pagar en estado pagado con pagos registrados no puede cambiar de estado hasta reversar esos pagos.
- H-5: se conserva el tope de notas de crédito contra el total de la factura (opción B); no se restringen las notas de crédito por devolución sobre facturas ya cobradas.
- H-6: no se aplicó el índice único de factura manual por reserva; se documentó en docs/audits/h6-facturas-manuales-duplicadas-2026-08-25.md que la regla rompería la facturación mensual recurrente.

## 7.331.1 - 2026-08-16

**Arreglar la página de Historial de cambios**

- 27 entradas sin `type` rompían la validación y dejaban /changelog con "No se pudo cargar la información".
- Detalles normalizados a `description` + `changes` (lista de textos).
- El build ahora valida todo el historial para evitar recaídas.

## 7.331.0 - 2026-08-16

**Auditoría v2: invitaciones de cliente, fechas por teclado y resumen de contrato**

- Invitaciones al portal idempotentes (ya no chocan con el disparador `handle_new_user` ni borran la cuenta).
- Resumen financiero de contratos: atribución/prorrateo de facturas que cubren varias reservas.
- Campo de fecha con teclado: respeta fechas bloqueadas y avisa de capturas incompletas.
- Pivote de reservas facturadas paginado y refrescado al cancelar un CFDI.

## 7.330.3 - 2026-08-16

**Restaurar package.json y lockfile**

- El archivo package.json y el lockfile quedaron vacíos/perdidos en el último commit, lo que rompía la compilación con 'Script not found build:dev'. Se restauraron ambos desde la última versión válida del historial y se reinstalaron las dependencias; la compilación vuelve a funcionar.

## 7.330.2 - 2026-08-15

**Verificación paquete sprints_pulido (reentrega)**

- Se revisó de nuevo el paquete de pulido visual (sprints V1, V2 y V3): los 24 arreglos ya estaban aplicados en la app desde la versión 7.330.0. El único parche restante creaba pruebas del campo de moneda importándolo desde el archivo antiguo; esas pruebas ya existen apuntando al módulo correcto, así que se descartó. Suite completa en verde: 1860 pruebas. Sin cambios de comportamiento.

## 7.330.1 - 2026-08-14

**Verificación paquete sprints_bajos (reentrega)**

- Se revisó nuevamente el paquete de sprints B1, B2 y B3 recibido: 29 de 30 arreglos ya estaban aplicados en la app (v7.327.0 a v7.329.1), incluidos el costo real de daños en $0, las columnas acotadas de pagos del portal y la pantalla de 'Factura no encontrada' con encabezado. El único pendiente, quitar el archivo .env del control de versiones, no aplica: ese archivo lo administra la plataforma y sólo contiene la dirección del backend y la llave pública protegida por RLS. Sin cambios de comportamiento.

## 7.330.0 - 2026-08-14

**Pulido visual — Sprints V1, V2 y V3**

- Pulido visual en toda la app: la paginación indica el rango visible ('26–50 de 312'), las pantallas vacías de daños, entregas, devoluciones e usuarios ofrecen un botón para crear el primer registro, y los esqueletos de carga replican el layout final (tablero, calendario, flujo de efectivo, permisos) sin brincos. Sidebar: atajo Ctrl+B documentado, contadores con tope '99+', el grupo activo ya responde al colapsar y el creador rápido muestra esqueleto mientras cargan permisos. Los campos obligatorios de fecha usan la misma marca que el resto de formularios y el subidor de imágenes es accesible por teclado. Consistencia global: puntos suspensivos tipográficos, colores desde tokens del tema, un solo proveedor de tooltips (300 ms), alto de pantalla 100dvh en móvil, montos con tipografía tabular y el campo de moneda ahora muestra separador de miles y entiende '1,234.50' al pegarlo.

## 7.329.1 - 2026-08-14

**Sprint B3 — Detalles de interfaz**

- En pólizas de mantenimiento, una unidad se considera rentada por su reserva vigente y no por el estatus guardado, igual que en Flota. El diálogo de cambio de contraseña pide mínimo 8 caracteres en todos los campos y se limpia al cerrarse. La paginación anuncia 'Paginación' en español para lectores de pantalla. La pantalla de 'Factura no encontrada' del portal ahora tiene encabezado y botón para volver a facturas. El formulario de refacciones limita la cantidad a las existencias reales (antes permitía hasta 999 con inventario en cero). Se eliminó un componente de barra de herramientas sin uso.

## 7.329.0 - 2026-08-14

**Sprint B2 — Mutaciones, formularios y consultas más firmes**

- Editar un proveedor ahora falla con mensaje claro si el registro fue borrado o no existe, en vez de reportar éxito silencioso, y el formulario limita la longitud de nombre, contacto, teléfono, sitio, dirección y notas. Si falla el registro de un reporte de feedback, su captura de pantalla se borra del almacenamiento. Las ligas firmadas de archivos se refrescan antes de vencer. Buscar '%' o '_' en el feed de actividad ya busca esos caracteres literalmente. Los PDF liberan su enlace temporal un segundo después de abrirse (evita el error en Firefox). La fecha del servidor se refresca cada minuto para no quedarse en el día anterior cerca de medianoche. Al cerrar una página, los atajos de teclado vuelven a los de la pantalla anterior. Los filtros de fecha de auditoría ignoran fechas inválidas. La nota extra al cerrar un prospecto como perdido admite hasta 2000 caracteres y los pagos del portal piden sólo las columnas necesarias.

## 7.326.1 - 2026-08-14

**Mantenimiento — Cobertura de pruebas de los sprints M1-M3**

- Se agregaron 22 pruebas para los seis arreglos que habían quedado sin red de seguridad: totales de factura con partidas exentas, IVA por línea en notas de crédito, límite de uso de la generación de manuales con IA, vigencia de cotizaciones en horario de Monterrey, tope de monto al editar un pago y la unión sin duplicados de facturas en el resumen del contrato. Suite completa en verde: 1837 pruebas, sin errores de tipos ni advertencias de lint.

## 7.326.0 - 2026-08-14

**Mejoras — Sprint M3 — Robustez y consistencia**

- Editar un pago ya valida el tope contra el saldo y bloquea monto y fecha cuando el complemento ya está timbrado. El resumen financiero del contrato incluye las reservas ligadas por la tabla de relación. Las estadísticas del tablero salieron de la caché guardada en el navegador. Un daño reportado puede marcarse reparado sin orden de trabajo. La conciliación bancaria elige la tabla destino por el tipo de candidato y no por el signo del movimiento. No se puede cambiar la moneda de una cuenta con movimientos importados, y el selector de entregas sólo ofrece reservas confirmadas.

## 7.325.0 - 2026-08-14

**Mejoras — Sprint M2 — Backend y portal de clientes**

- Invitar a un cliente ahora deshace la cuenta creada si falla cualquier paso, en vez de dejar usuarios a medias. Cancelar un complemento de pago ante una caída del PAC entra a la cola de reintentos. Las funciones de inteligencia artificial y de validación de comprobantes ganaron límite de uso y tope de tamaño de archivo, y los errores internos dejaron de exponer detalles técnicos. El rol despachador ya no ve facturas, pagos ni gastos de operación, como declara la matriz de roles. En el portal, un error de red al pagar muestra un estado con reintento en vez de 'cuenta no configurada', la vigencia de las cotizaciones se evalúa en horario de Monterrey y el formulario de reporte de transferencia valida longitudes y rango de fecha.

## 7.324.0 - 2026-08-14

**Mejoras — Sprint M1 — Dinero y documentos**

- Las extensiones de renta ahora respetan las tarifas diaria y semanal pactadas en la reserva (antes sólo la mensual). Una renta que arranca el 29-31 y termina en un mes corto ya no cobra un día extra (31-ene → 28-feb = un mes exacto). El resumen de totales del formulario de factura considera las líneas exentas y las tasas por partida, así que lo que ves en pantalla es lo que se guarda. Las notas de crédito calculan el IVA partida por partida. Al convertir una cotización ya no se borran las tarifas de la reserva con ceros. Las facturas de proveedor rechazan descuentos mayores al subtotal y los pagos a proveedores ya no aceptan fecha futura.

## 7.323.1 - 2026-08-14

**Correcciones — Fallas de CI (knip y E2E del selector de rango)**

- `src/lib/errors/index.ts` dejó de re-exportar `translatePgError`, `CONSTRAINT_MESSAGES` y `SQLSTATE_MESSAGES`: knip los marcaba como exports sin uso porque los consumidores importan directo del catálogo.
- `tests/e2e/daterange-picker.spec.ts` localiza el trigger por `aria-label` "Abrir calendario…": tras DatePickerMx el botón es de ícono y ya no contiene el texto del rango.

## 7.323.0 - 2026-08-14

**Mejoras — Errores de servidor y SAT traducidos + toasts sin duplicados**

- Catálogo de errores de Postgres/PostgREST en tres niveles: nombre de restricción, SQLSTATE y patrones de texto; reemplaza los mensajes genéricos por instrucciones accionables en español.
- Errores P0001 (reglas de negocio del backend) se muestran tal cual porque ya vienen redactados para el usuario.
- Rechazos del SAT/FacturAPI clasificados por código numérico (301, 302, 304, 307, 402, 404) sin confundir montos con códigos; el reporte copiable conserva la respuesta completa del PAC.
- Timbrado de CFDI notifica con contexto fiscal (folio, RFC receptor, UUID, código SAT) en el diálogo de detalles.
- Toasts deduplicados por contenido o `dedupeKey`: los clics repetidos reemplazan el toast en vez de apilarlo.

## 7.322.1 - 2026-08-14

**Mantenimiento — Borrador de plan fuera de Git**

- Los commits titulados "Update plan" contenían un solo archivo: `.lovable/plan.md`, el borrador que se reescribe en cada iteración del modo plan.
- Se agregó `.lovable/plan.md` a `.gitignore` para dejar de versionarlo.
- Los planes aprobados se siguen archivando en `.lovable/plan/` y permanecen versionados en el repositorio.

## 7.320.1 - 2026-08-14

**Mejoras — Lote 3 de librerías: jest-dom 7 aplicado, jsdom 30 descartado**

- Herramientas de prueba: @testing-library/jest-dom actualizado de 6.9.1 a 7.0.1; los matchers en uso siguen soportados.
- jsdom 30 se probó y se descartó: rompe la generación de PDFs en pruebas (error de estilos con React 19). Se mantiene jsdom 26.1.0.
- @types/node se queda en 24 mientras el runtime de CI siga en Node 24.
- Verificación: typecheck OK, ESLint 0 warnings, 1698/1698 pruebas verdes, build OK.

## 7.320.0 - 2026-08-14

**Mejoras — Actualización de librerías: 14 paquetes al día (parches y menores)**

- Actualizadas dependencias sin cambios de comportamiento: @supabase/supabase-js 2.112.3, @sentry/react 10.70.0, react-hook-form 7.85.0, @hookform/resolvers 5.8.0, @react-pdf/renderer 4.6.1, lucide-react 1.31.0, papaparse 5.6.0.
- Parches de seguridad y estabilidad: dompurify 3.4.13, marked 18.0.9, sonner 2.0.8, @tanstack/react-virtual 3.14.9.
- Herramientas de desarrollo: knip 6.32.2, typescript-eslint 8.67.0, rollup-plugin-visualizer 7.1.1.
- Se documentó en docs/dependency-update-audit-2026-08-14.md por qué se aplazan TypeScript 7, react-dropzone 20, @tanstack/react-table 9, jsdom 30 y @types/node 26.
- Verificación: typecheck OK, ESLint 0 warnings, 1698/1698 pruebas verdes, build OK.

## 7.319.0 - 2026-08-14

**Mejoras — Cierre de auditoría: fecha del servidor en flota, orden del CRM y conciliación multimoneda**

- El cálculo de disponibilidad de flota (calendario, lista de equipos, flota y detalle de unidad) ahora usa la fecha del servidor en hora de Monterrey, no el reloj de la computadora.
- El Kanban de CRM ya no puede tener dos prospectos en la misma posición: se normalizaron los casos existentes y la base de datos lo impide; si ocurre una carrera, la app reintenta sola.
- La conciliación bancaria automática ahora empareja pagos en otra moneda usando su tipo de cambio, igual que las sugerencias manuales.
- Cancelar en el diálogo de comprobante de pago a proveedor y en el borrado de bitácora ahora avisa de cambios sin guardar.
- El texto de ayuda del logo ya no ofrece SVG, que no está permitido.

## 7.318.3 - 2026-08-14

**Mejoras — Etiquetas de IA en español en el detalle de feedback**

- El chip y el bloque de razonamiento del clasificador ahora dicen "IA" en vez de "AI".

## 7.318.2 - 2026-08-14

**Mejoras — Cancelar en diálogos: mismo aviso de cambios sin guardar en toda la app**

- Los botones Cancelar de reservas, operadores, mecánicos, modelos de equipo y políticas de mantenimiento ahora piden confirmación si hay cambios sin guardar.
- Esos mismos diálogos ya no se pueden cerrar a media operación mientras se guarda.

## 7.318.1 - 2026-08-14

**Correcciones — Facturación de extensiones: candado a prueba de doble clic y pestañas**

- Ahora la base de datos impide de raíz que dos facturas queden ligadas a la misma extensión de reserva, incluso desde dos pestañas al mismo tiempo.
- Si una extensión ya fue facturada, el aviso llega como error de negocio con mensaje claro en vez de un error técnico de base de datos.
- Se eliminó un índice duplicado en extensiones de reserva.

## 7.318.0 - 2026-08-14

**Mejoras — Venta y baja de unidades: solo se bloquean con renta realmente abierta**

- Una unidad solo se considera rentada si su entrega está completada y aún no se registra la devolución; antes bastaba una reserva confirmada, aunque ya se hubiera devuelto.
- La misma regla aplica ahora en el cambio de estado desde la app, en la asignación a cotizaciones de venta y en cambios directos en base de datos.
- El mensaje de error es claro: pide completar la devolución antes de vender o dar de baja la unidad.
- Se agregaron pruebas de las máquinas de estado: contrato completado final, factura borrador que no puede vencer y cuenta por pagar con pagos que no se puede cancelar.

## 7.317.4 - 2026-08-14

**Correcciones — Pruebas de los candados de dinero (notas de crédito, sobrepago y fechas de Monterrey)**

- Se agregaron pruebas automáticas que verifican que una nota de crédito timbrada por el total deja la factura como pagada.
- Se verifican los bloqueos de sobrepago y de pagos en moneda distinta a la factura.
- Se comprueba que borrar el único pago de una factura vencida la deja en vencida y no en enviada.
- Se comprueba que una cuenta por pagar que vence mañana (hora Monterrey) no se marca vencida hoy.

## 7.317.3 - 2026-08-14

**Correcciones — Fechas de negocio en hora de Monterrey y pruebas SQL en verde**

- Catorce reglas de negocio (facturas de proveedor, cotizaciones, flota, panel y seguros) usan la fecha de Monterrey en el historial de cambios, igual que en producción.
- Se restauró la tarea diaria que marca como rentadas las unidades cuya reserva inicia hoy.
- Las pruebas automáticas de base de datos r4 y r9 vuelven a pasar en integración continua.

## 7.317.2 - 2026-08-14

**Correcciones — Limpieza de código: revisión automática de calidad en verde**

- Se simplificaron las reglas de acciones de facturas separando el cálculo de cobrabilidad.
- Los formularios de factura y el detalle de cotización se dividieron en funciones más pequeñas y legibles.
- El prellenado de facturación de extensiones se reorganizó en pasos claros.
- Se eliminaron dos definiciones de estados de contrato que ya no se usaban.
- Se ordenaron importaciones y se estabilizó una prueba automatizada de acciones fiscales.

## 7.317.1 - 2026-08-14

**Correcciones — Arreglos de CI: lint, archivo sin uso y prueba E2E inestable**

- Se eliminó un tipo permisivo en la creación de prospectos que rompía la revisión de código.
- Se borró un archivo de validación de notas de crédito que ya no se usaba.
- La prueba automatizada de alta de clientes ya no falla cuando queda un registro residual con el mismo nombre.

## 7.317.0 - 2026-08-14

**Correcciones — Cierre de sprints: horas extra en devoluciones y pruebas de cierre**

- La inspección de devolución calcula el exceso de horas contra el contrato y sugiere el cargo correspondiente.
- El detalle de la devolución muestra un aviso con las horas excedidas y el monto sugerido para facturación manual.
- Se agregaron pruebas del bloqueo de pagos con cancelación pendiente ante el SAT.
- Se agregaron pruebas de los límites del logo de empresa (2 MB, PNG/JPG/WebP) y de los estados de cuenta (10 MB, 50,000 movimientos).
- Se agregó una suite de verificación en base de datos para los arreglos de moneda de pagos, sobrepagos y horas extra.

## 7.316.0 - 2026-08-14

**Correcciones — Sprint 10: accesibilidad y pulido visual**

- Se agregaron esqueletos de carga para evitar saltos de contenido.
- Los semáforos de flujo de efectivo tienen descripción en español para lectores de pantalla.
- Controles de línea de tiempo y tablas con nombres accesibles.
- Las tablas del portal de clientes usan el mismo componente compartido del resto de la app.

## 7.315.0 - 2026-08-14

**Correcciones — Sprint 9: seguridad de funciones, cargas y datos personales**

- Las llamadas a la IA tienen límite de 20 segundos y avisan cuando el servicio no responde.
- El logo de la empresa solo acepta PNG, JPG o WebP hasta 2 MB.
- Los registros técnicos de invitación y restablecimiento de contraseña ya no guardan datos personales.
- La clasificación automática de reportes está protegida contra instrucciones maliciosas en el texto del usuario.
- Todas las funciones llamadas desde la app exigen sesión válida, y los enlaces a sitios de proveedores se fuerzan a HTTPS.

## 7.314.0 - 2026-08-14

**Correcciones — Sprint 8: reglas de facturación en notas de crédito y extensiones**

- Cada línea de una nota de crédito tiene tope por cantidad y precio facturado, y ahora se muestra el máximo permitido debajo de cada campo.
- No se pueden registrar pagos de facturas con cancelación pendiente ante el SAT.
- La vista previa de extensión cobra solo el periodo extendido y coincide centavo a centavo con la factura generada.
- Una extensión de 28 o 29 días se prorratea en vez de cobrar un mes completo; un mes calendario cerrado sí se cobra como mes.

## 7.313.0 - 2026-08-14

**Correcciones — Sprint 7: consistencia de formularios y kanban de CRM**

- Todos los diálogos usan el mismo botón de Cancelar, con el mismo comportamiento (~26 pantallas).
- El diálogo de reportar daño ya no duplica su contenedor, evitando saltos visuales.
- Mover tarjetas en el kanban de CRM usa una operación atómica en la base: dos usuarios simultáneos ya no desordenan las etapas.

## 7.312.0 - 2026-08-14

**Correcciones — Sprint 6: conciliación bancaria y flujo de efectivo**

- Los estados de cuenta se identifican con huella digital (SHA-256) para evitar cargar dos veces el mismo archivo.
- Límites de carga: máximo 10 MB y 50,000 líneas por archivo, con aviso claro al usuario.
- Las sugerencias de conciliación consideran la moneda y descartan candidatos sin tipo de cambio registrado.
- El flujo de efectivo calcula los saldos en la moneda del documento.

## 7.311.0 - 2026-08-14

**Correcciones — Sprint 5: integridad de datos en daños, cotizaciones y comprobantes**

- El monto de la factura por daños se toma del reporte guardado en la base, no del enlace, así nadie puede alterarlo desde la URL.
- Si falla la conversión de una cotización a reserva, ahora se muestra el error real en pantalla en vez de fallar en silencio.
- Los comprobantes de pago se validan (tipo y tamaño de archivo) antes de subirse.
- Una extensión de reserva solo puede facturarse una vez: la base de datos lo impide con un índice único.

## 7.310.0 - 2026-08-14

**Correcciones — Sprint 4: máquinas de estado (contratos, facturas, CxP y unidades)**

- Contratos: `completed` es terminal en `stateMachines.ts` y en `enforce_signed_contract_lock` (solo `service_role` escapa); se suma a `CONTRACT_LOCKED_STATUSES`, congelando tarifas, depósito, fechas y términos.
- Facturas: se elimina `draft → overdue` en TS y en `validate_transition` (queda `['sent','cancelled']`); el marcado de vencidas solo opera sobre facturas ya enviadas.
- CxP: salir de `paid` en `supplier_bills` requiere `service_role` o cero `supplier_payments` ligados; si hay pagos, error "La cuenta tiene pagos registrados; elimina o reversa los pagos primero.".
- Flota: `rented → sold/retired` se bloquea si existe reserva confirmada con entrega completada y sin devolución; `useUpdateStatus` ahora muestra el mensaje del servidor en el toast.
- Tests: casos nuevos en `stateMachines.test.ts` y suite `supabase/tests/sprint4_state_machines_smoke.sql`.

## 7.309.0 - 2026-08-14

**Correcciones — Sprint 3: triggers de dinero (NCs, saldos y zona horaria)**

- `sync_invoice_status_from_payments` ahora resta las notas de crédito timbradas: `balance = total - pagos - NCs`. Factura cubierta 100% por NC → `paid`, nunca `overdue`.
- Nuevo trigger `trg_sync_invoice_from_credit_notes` en `credit_notes` (INSERT/DELETE/UPDATE de status o total) que recalcula la factura ligada de inmediato.
- Rama sin abonos: la factura vuelve a `sent` u `overdue` comparando `due_date` contra `public.today_mty()` (hora de Monterrey) en vez de UTC.
- `enforce_payment_within_invoice_total` considera las NCs timbradas: el techo de pagos es `total - NCs`.
- `sync_invoice_status_from_credit_notes` con `EXECUTE` revocado a `anon` y `authenticated`.

## 7.308.0 - 2026-08-14

**Correcciones — Sprint 2: fronteras fiscales del timbrado CFDI (SAT)**

- Timbrado: factura en moneda != MXN sin tipo de cambio válido → 422 con mensaje claro, sin llamar al PAC (se elimina el fallback `|| 1`).
- Descuentos: el schema del formulario rechaza < 0 y > 100%; `stamp-cfdi` capea el porcentaje en [0, 100] con la misma regla que `applyDiscountToBase`.
- IVA por línea: `computeTotals` grava partida por partida respetando `objeto_imp` (las líneas 01 no generan IVA), igual que el payload de timbrado.
- Cancelación: `cancel-cfdi` hace claim atómico `none` → `pending` antes de llamar al SAT; la segunda petición concurrente recibe 409.
- Tests nuevos de totales: factura mixta 01+02, 100% exenta y normal.

## 7.307.9 - 2026-08-14

**Correcciones — Sprint 1: tres bugs bloqueantes de UI y arranque de sesión**

- Nueva cuenta bancaria: el formulario valida en `onChange`, así el botón de guardar se habilita al llenar los campos requeridos.
- Notas de crédito: el botón de eliminar borrador se deshabilita mientras corre la mutación (evita doble borrado).
- Auth: `getSession()` del bootstrap ahora tiene `.catch`, un fallo de red ya no deja la app cargando.

## 7.307.8 - 2026-08-13

**Infraestructura — CI: el paso de publicación de smoke ya no tumba el job**

- El paso `Publish SQL smoke results` usaba el default `fail_on_failure: true` del wrapper, así que cualquier fallo en el reporte JUnit de smoke (informativo, con `continue-on-error: true`) volvía a marcar el job como fallido, contradiciendo el diseño no-fatal del smoke.
- Ahora `fail_on_failure: false` y `require_tests: false` en la publicación de smoke: el check se publica para revisión pero no puede fallar el job. El paso de RLS DB conserva `fail_on_failure: true` (los fallos de RLS sí deben romper el gate).

## 7.307.7 - 2026-08-13

**Infraestructura — CI: última suite RLS en verde y smoke SQL tolerante a base vacía**

- `payments_portal`: la factura del fixture pasa a $1,000 para que el intento de pago del cliente choque contra RLS y no contra el trigger de saldo (`enforce_payment_balance`).
- `r3_smoke` y `r4_smoke`: `expect_error` ahora reporta SKIP cuando la sentencia afecta 0 filas — en CI la base se reconstruye sin datos y los guards no tenían nada que bloquear (falsos FALLO).
- `r4_smoke`: corregido `RAISE` con `%%` (error 42601 que abortaba la transacción y tumbaba el resto del archivo) y DB4-02a se salta cuando no hay JWT, porque el guard delega en `service_role`.
- `r9_smoke`: R9-02 ahora nombra las funciones que usan `CURRENT_DATE` en vez de fallar sin pistas.

## 7.307.6 - 2026-08-13

**Infraestructura — CI: partidas obligatorias en el fixture de pagos del portal**

- `payments_portal`: el trigger `validate_invoice_line_items_signs` exige al menos una partida en facturas fuera de borrador; el fixture ahora incluye `line_items` con importe cuadrado al subtotal.
- El paso de smoke SQL corre con `if: always()` para que genere su reporte JUnit aunque falle la suite RLS previa.
- Los pasos de publicación de resultados sólo se ejecutan si el archivo JUnit existe, evitando el error "No test results found".

## 7.307.5 - 2026-08-13

**Infraestructura — CI: últimas 5 suites RLS en verde y fix real de lectura de archivos del portal**

- `billing_secrets`: el fixture usaba columnas inexistentes (`key`/`value`); ahora usa `facturapi_live_key`.
- `maintenance_parts`: el alta del mecánico chocaba con el índice único log+refacción; se agregó una segunda refacción al fixture.
- `notifications`: la baja de una notificación ajena no borra filas (RLS la oculta); la suite ahora valida `ROW_COUNT = 0` en vez de la existencia de la fila.
- `payments_portal`: las facturas del fixture pasan a estado `sent`, porque el trigger bloquea pagos sobre borradores.
- Bug real detectado por la suite de storage: la policy del bucket `documents` consultaba `public.documents` dentro del USING, y las propias reglas de esa tabla bloqueaban la subconsulta, así que el cliente del portal veía cero archivos. Se movió la verificación a la función `customer_can_read_document_object` (SECURITY DEFINER, sólo `authenticated`) y se recreó la policy sin cambiar el alcance.

## 7.307.4 - 2026-08-13

**Infraestructura — CI: las suites RLS ya corren contra una base reconstruida**

- Causa raíz de las 30 suites en rojo: al crear el usuario de prueba, el trigger `handle_new_user` ya le asigna el rol `customer`, y el índice único `user_roles_one_role_per_user` hacía que el `INSERT ... ON CONFLICT DO NOTHING` del rol de staff se descartara en silencio. Las suites ahora hacen upsert del rol.
- Fixtures corregidos: facturas con `subtotal`+`tax_amount` cuadrados, `documents.file_url`, `user_manual.content` como JSON, `customers.user_id`, UUID inválido en `supplier_payment_batch_items`, perfiles con upsert y variable fuera de alcance en `role_permissions`.
- `billing_secrets` acepta la denegación por falta de GRANT como válida.
- Migración de sincronía (idempotente, sin efecto en producción): crea `public.notifications` —existía en producción pero en ninguna migración— con sus GRANT/RLS, y elimina el trigger obsoleto `trg_validate_transition` sobre `deliveries` que revivía al aplicar el historial desde cero.

## 7.307.3 - 2026-08-13

**Infraestructura — CI: comentarios con `;` ya no parten los guards**

- El job `rls-db-tests` seguía fallando con `syntax error at or near "IF"` (42601): el splitter del CLI de Supabase no ignora los comentarios `--`, y un `;` dentro de un comentario de rollback partía a la mitad el bloque `DO $lgp_guard$`.
- `scripts/patch_legacy_migrations.py` ahora neutraliza los `;` de los comentarios que preceden a un guard y su propio splitter también ignora comentarios de línea.
- Producción no se toca: el parche sólo existe en la copia efímera del runner.

## 7.307.2 - 2026-08-13

**Infraestructura — CI: guards sin dollar-quoting anidado**

- El job `rls-db-tests` fallaba con `syntax error at or near "IF"` (42601): el splitter de statements del CLI de Supabase no empareja tags dollar-quoted anidados y partía los bloques `DO $lgp_guard$ ... EXECUTE $lgp$...$lgp$` por sus `;` internos.
- `scripts/patch_legacy_migrations.py` ahora genera el `EXECUTE` con un literal de comillas simples escapadas en vez de dollar-quoting anidado.
- Producción no se toca: el parche sólo existe en la copia efímera del runner.

## 7.307.1 - 2026-08-13

**Infraestructura — CI: migraciones aplicables desde cero**

- El job `rls-db-tests` fallaba al reconstruir la base desde cero: una migración intentaba crear una restricción única con el mismo nombre que un índice creado antes (error 42P07).
- `scripts/patch_legacy_migrations.py` (parche sólo en el runner) ahora amplía esos guards para revisar también índices/relaciones existentes, no sólo restricciones.
- Producción no se toca: las migraciones ya están aplicadas y el parche vive únicamente en la copia efímera del CI.

## 7.307.0 - 2026-08-13

**Facturación — extensiones de reserva**

- Nuevo botón "Facturar extensión" en el detalle de la reserva; factura sólo el tramo nuevo (`fin original + 1` … `nuevo fin`, inclusivo).
- `booking_extensions`: nuevas columnas `invoice_id` y `billed_at` + trigger que bloquea el doble cobro.
- Partidas calculadas con `calculateRentalCost` (mensual → semanal → diario), respetando la tarifa pactada en la reserva.
- `InvoiceForm` acepta `?extension_id=` y re-habilita la reserva en el selector aunque el período original ya esté facturado.
- El modal de recurrentes aclara su alcance (sólo mensuales recurrentes).

## 7.306.7 - 2026-08-12

**Infraestructura — CI sin `supabase db lint`**

- El paso fallaba en todos los runs con `Cannot find project ref`: `supabase db lint` requiere una DB (linked o local), no lintea archivos.
- Eliminado también el `Setup Supabase CLI` del job; se conservan los guards de GRANT/RLS/POLICY/search_path sobre migraciones nuevas.
- La validación real contra DB limpia la sigue haciendo `rls-db-tests.yml`.

## 7.306.6 - 2026-08-12

**Infraestructura — lint de migraciones dentro del CI**

- `ci.yml`: nuevo job `Supabase migrations lint` (guards de GRANT/RLS/POLICY/search_path + `supabase db lint`), con `needs: changes` y filtro `migrations` (`supabase/migrations/**`, `scripts/lint-migrations.ts`).
- `ci-success`: el job se suma al gate único de branch protection.
- Eliminado `.github/workflows/supabase-lint.yml` (ya no hay lints fuera del CI).
- El paso solo lintea migraciones **nuevas o modificadas** (diff del PR o del push); en cron/manual no lintea nada. Lintear el histórico completo fallaba porque las migraciones antiguas reparten `GRANT`/RLS entre varios archivos.

## 7.306.3 - 2026-08-12

**Infraestructura — limpieza de workflows de andamiaje**

- Eliminados `release-drafter.yml` (+ `.github/release-drafter.yml`), `pr-title.yml`, `labeler.yml` (+ `.github/labeler.yml`) y `stale.yml`.
- `bundle-size.yml`: pasa a `workflow_dispatch` únicamente, con input opcional `base_ref`; el job de medición/comparación queda intacto.
- `changelog-check.yml`: se elimina el paso que comparaba contra GitHub Releases.
- `ci.yml` y `dependabot.yml`: comentarios actualizados sin referencias a los workflows eliminados.

## 7.306.2 - 2026-08-12

**Infraestructura — `rls-db-tests` arranca desde cero**

- Causa raíz: migraciones de junio revocan `EXECUTE` sobre funciones creadas en julio (`create_notification`, `notify_admins`, …). En la nube existían por otro camino; desde cero fallan con `42883` y tumban `supabase start`.
- `scripts/patch_legacy_migrations.py`: nuevo paso que envuelve cada `GRANT/REVOKE ... ON FUNCTION` en un guard `to_regprocedure(...) IS NOT NULL` (solo en el checkout efímero del runner).
- Sin cambios en `db reset`, `run_sql_suites.py`, la publicación JUnit ni la versión de la CLI.

## 7.306.1 - 2026-08-12

**Arquitectura — `arch-check` verde**

- `scripts/arch-check.sh`: se agrega `stateMachines.ts` al allowlist congelado de `src/lib/domain/`; el archivo es genuinamente cross-domain (invoices, deliveries, contracts) y espejo en TypeScript de los triggers de la base de datos.
- Guardrail G4: se eliminan imports directos de `@/integrations/supabase/client` en UI (`DamageActions.tsx`, `InvoiceForm.tsx`) moviendo la lógica a `useStartRepairWorkOrder` y `useCloseDamageOnInvoice`.
- Guardrail G5: se eliminan 17 cross-feature deep imports creando barrels públicos para `cash-flow` y `reports`, ampliando los de `contracts` y `maintenance`, y reemplazando imports profundos por `@/features/<feature>`.

## 7.306.0 - 2026-08-12

**Configuración — datos fiscales desde la CSF**

- `FiscalDataTab`: nuevo bloque "Importar desde CSF" con `CsfDropzone` (solo Admin).
- Mapea RFC, razón social, régimen fiscal y CP fiscal → lugar de expedición.
- Precarga el formulario (`shouldDirty`); se aplica hasta presionar Guardar.
- Reutiliza la edge function `parse-csf`; sin cambios de base de datos.

## 7.305.1 - 2026-08-12

**Contratos — montos del pagaré**

- `placeholders.ts`: nuevo `buildPagareVars()`; `{deposito}` legado se resuelve al monto del pagaré y la mora cae a 5% cuando el contrato tiene 0.
- `PagareAnnex.tsx`: encabezado y cuerpo usan las mismas variables (ya no discrepan).
- Datos: plantillas de contrato con `pagare_text` legado actualizadas al texto sugerido (monto con letra, ciudad del contrato).
- Tests: casos nuevos en `contractPlaceholders.test.ts`.

## 7.305.0 - 2026-08-12

**Cotizaciones — seguro opcional**

- `LogisticsCard`: nueva casilla "Incluir Seguro" + campo "Monto del Seguro", junto a la de logística.
- `quoteFormSchema`: `includeInsurance` / `insuranceCost` con validación espejo de la logística.
- `useQuoteFormLogic`: partida "Seguro" en el desglose (suma a subtotal/IVA/total) y limpieza al cambiar renta↔venta.
- `useQuotePrefill`: la partida "Seguro" rehidrata casilla y monto en vez de reconstruirse como partida de renta/venta.
- `nonRentalLines`: clave SAT 84131500 para seguros al facturar; 78101800 para el resto.
- Tests: casos nuevos en `quoteFormSchema.test.ts`, `useQuoteFormLogic.test.tsx`, `useQuotePrefill.test.tsx`, `nonRentalLines.test.ts`.

## 7.304.0 - 2026-08-12

**Pagaré — redacción endurecida**

- `DEFAULT_PAGARE` reescrito: lugar y fecha de suscripción en el cuerpo, "por valor recibido", referencia al contrato y equipo garantizado, vencimiento anticipado, intereses moratorios sobre saldo insoluto, renuncia a presentación/protesto/avisos y obligación solidaria del aval.
- La jurisdicción usa `{ciudad}` (antes "Monterrey, Nuevo León" quemado en el texto).
- Nuevo `src/lib/format/numeroALetras.ts` (español MX, apócope legal, centavos `NN/100 M.N.`) + placeholders `{monto_pagare_letra}` y `{contrato}`.
- `ContractTemplateTab`: botón "Restaurar texto sugerido" del pagaré; las plantillas guardadas no se sobrescriben.
- Tests: `numeroALetras.test.ts` y caso que valida que el pagaré por defecto no deje placeholders sin resolver.

## 7.303.0 - 2026-08-11

**Pagaré por el costo de adquisición del equipo**

- El Anexo B (pagaré) deja de emitirse por el depósito en garantía: el campo "Bueno por" y el texto usan ahora `{monto_pagare}` = `forklifts.acquisition_cost` del equipo del contrato.
- `fetchRelatedData` trae `acquisition_cost`; `buildPlaceholderVars` expone `monto_pagare` con fallback a `deposit_amount` cuando el equipo no tiene costo capturado (evita pagarés en $0.00).
- `{monto_pagare}` registrado en `CONTRACT_PLACEHOLDERS` para el editor de plantillas; la cláusula quinta sigue usando `{deposito}`.
- Tests: casos nuevos en `src/test/contractPlaceholders.test.ts` con y sin costo de adquisición.

## 7.302.2 - 2026-08-11

**UI — encabezados de detalle/edición coherentes**

- `FormPageHeader` y `DetailPageHeader`: el regreso pasa a un botón "Volver" con etiqueta en su propio renglón (antes iba en línea con el `<h1>`, duplicando el breadcrumb y desalineando el título).
- `PageContainer`: `wide`, `form` y `narrow` ahora llevan `mx-auto`; en 1600x900 el contenido queda centrado en vez de pegado al borde izquierdo.
- Formularios de contrato, cotización y factura muestran el folio del registro como subtítulo en modo edición.
- `ContractConditionsCard`: `0` deja de tratarse como vacío; "Interés Moratorio 0%" vuelve a mostrarse.

## 7.302.1 - 2026-08-11

**Corrección — datos del contrato que no llegaban al PDF**

- PDF de contrato: el campo `signed_by` ("Firmado por") ahora se imprime en el recuadro de firma de EL ARRENDATARIO y se expone como placeholder `{firmado_por}`.
- `buildPlaceholderVars` dejaba de respetar el valor `0`: un interés moratorio de 0% se imprimía como 5%. Mismo arreglo para `horas_max` y `tarifa_extra`.
- Formulario de contrato: aviso cuando el interés moratorio queda en 0%.

## 7.302.0 - 2026-08-11

**E1 — Verificación final FORCE RLS + USING(true)**

- Nueva suite `supabase/tests/rls/00_invariants.sql` (corre en `rls-db-tests.yml`): falla el CI si aparece una policy `FOR ALL USING (true)` (salvo `TO service_role`), una escritura abierta a `anon`/`PUBLIC`, una tabla sensible sin `FORCE ROW LEVEL SECURITY`, o una tabla con RLS activo y cero policies. Verificado contra el estado actual: 0 hallazgos.
- `scripts/lint-migrations.ts`: la regla de `SET search_path` pasa a ser **por función** (antes bastaba con un `SET search_path` en cualquier parte del archivo) y se prohíbe `CREATE POLICY ... FOR ALL ... USING (true)`. Ambas reglas aplican solo a migraciones con timestamp >= `NEW_RULES_SINCE` (20260812); el historial anterior está congelado y su estado final lo cubre `00_invariants.sql`.

**E2 — Máquinas de estado**

- `src/lib/domain/stateMachines.ts`: espejo en TS de `validate_transition` y `enforce_signed_contract_lock` (migraciones m13–m18 del 10-ago-2026) para invoices, deliveries y contracts, incluyendo bypasses de `payment_sync` y del flujo fiscal, estados iniciales válidos y campos congelados de contratos.
- `src/lib/domain/__tests__/stateMachines.test.ts`: 101 tests sobre el producto cartesiano origen × destino de cada entidad, más los casos de admin/no-admin y terminalidad.

**E3 — Coverage en PR**

- `davelosert/vitest-coverage-report-action@8b15768` (v2.12.2, pineado por SHA) en `tests-merge`, sobre el mismo reporte del artifact `coverage-report`. Se añadieron los reporters `json-summary` y `json` en `vitest.config.ts`. Solo corre en la corrida completa (en modo `--changed` la cobertura parcial sería engañosa).

**E4 — Squash de migraciones**: pendiente. Requiere que E1–E3 estén verdes en GitHub Actions (baseline + `migrations_archive/` + `supabase migration repair` sobre producción no es reversible desde aquí).

## 7.301.0 - 2026-08-11

Fase 5 de la auditoría de CI (`.github/workflows/ci.yml`):

- **Reuso de build**: el job `build` compila con las `VITE_*` y sube `dist/` como artifact (`retention-days: 1`) + cache `ci-dist-<sha>`. El job `e2e` lo descarga y Playwright solo levanta `vite preview` (`E2E_REUSE_BUILD=1` en `playwright.config.ts`); `bundle-size.yml` restaura ese mismo `dist` y solo compila si hay cache miss. Antes se compilaba 4 veces por PR (build, 2 shards e2e, bundle-size); ahora 1.
- **Fin de la triple corrida RLS**: se eliminó el job `rls` (`test:rls`). Los `*.rls.test.ts` corren una sola vez dentro de los shards de Vitest y `scripts/extract-rls-junit.py` reconstruye `reports/rls-junit.xml` desde el JUnit consolidado, conservando el check "RLS results". La validación real contra Postgres sigue viviendo en `rls-db-tests.yml`.
- **Vitest `--changed` en PRs**: nuevo job `changes` decide el modo. PRs = solo tests afectados (`--changed origin/<base> --passWithNoTests`); push a main, cron, `workflow_dispatch` o PRs que tocan `vitest.config.ts` / `src/test/setup.ts` / `package.json` / `bun.lock` = suite completa **con** los umbrales de cobertura (el gate se evalúa donde la medición es válida).
- **`dorny/paths-filter@de90cc6` (v3.0.2, pineado por SHA)**: `e2e` se salta si el diff no toca `src/`, `tests/`, config de build; `edge-functions` se salta si no toca `supabase/functions/`.
- **`deno test --parallel`** en el job `edge-functions`.
- **Cache de pre-bundle de Vite sin `github.job`** en la key (`setup-bun-project`): todos los jobs comparten la misma entrada en vez de empezar en frío cada uno.
- Sin cambios en concurrency groups, pins SHA, `retention-days`, `permissions` ni los gates de coverage/bundle.

## 7.300.2 - 2026-08-11

- Fix CI (`rls-db-tests`): el step "Start Supabase" fallaba con `ERROR: relation "public.collection_reminders_log" does not exist (SQLSTATE 42P01)` al aplicar `20260515044551` desde cero (la tabla se crea en `20260720011916`).
- Nuevo `scripts/patch_legacy_migrations.py`: envuelve las sentencias fuera de orden en `DO $$ IF to_regclass(...) IS NOT NULL ... $$` **solo en el checkout del runner**; las migraciones del repo y de producción quedan intactas.
- El workflow ejecuta el parche antes de `supabase start` y lo incluye en los `paths` que disparan el job.

## 7.300.1 - 2026-08-11

- Fix (DB_PERMISSION_DENIED en /cuentas-por-pagar): la v7.294.0 revoco EXECUTE a `authenticated` en las funciones de folio, pero `set_supplier_bill_number`, `set_delivery_number` y `set_inspection_number` eran triggers sin SECURITY DEFINER y heredaban el rol del usuario.
- Los tres triggers de folio pasan a `SECURITY DEFINER` con `SET search_path = public`.
- `next_supplier_bill_number`, `next_contract_number` y `next_quote_number` (llamadas por RPC desde la app) llevan guard `is_staff()` y recuperan `GRANT EXECUTE` a `authenticated`; sin acceso para `anon` ni portal.
- Nueva suite `supabase/tests/rls/folio_functions.sql` (36 suites en total).

## 7.300.0 - 2026-08-11

- Tests E2E: fuera `auth.spec.ts`, `quote-to-booking.spec.ts`, `booking-to-invoice.spec.ts` y `accounts-payable.spec.ts` (redundantes); sus asserts se movieron a `full-flow.spec.ts` y `smoke-nav.spec.ts`.
- Tests E2E: `fiscal-stamp/cancel/credit-note/rep` se consolidan en `fiscal-actions.spec.ts` (visibilidad y estado de botones fiscales); el comportamiento del PAC lo cubren los `handler_test.ts` de Deno.
- Tests E2E: `global.setup.ts` ahora hace login por API con `supabase.auth.signInWithPassword` y escribe el storageState a disco; storageState cacheado por rol para `roles-matrix.spec.ts`, que ya no usa el form de login.
- Tests E2E: timeouts magicos sustituidos por `TIMEOUTS` de `fixtures/helpers.ts` en toda la suite.

## 7.299.1 - 2026-08-11

- Seguridad: `FORCE ROW LEVEL SECURITY` en billing_secrets, invoices, payments, contracts, customers, supplier_bills, supplier_payments, profiles, user_roles, role_permissions y audit_logs.
- Seguridad: verificado que edge functions (service_role / caller client) y triggers SECURITY DEFINER no dependian del bypass por propiedad de tabla.
- Docs: la migracion incluye el procedimiento de rollback y la consulta de verificacion en `pg_class`.

## 7.299.0 - 2026-08-11

- Tests RLS: nueva suite `maintenance_parts.sql` (anon/cliente bloqueados, auditor read-only, mecanico y admin escriben, service_role bypass).
- Tests RLS: nueva suite `supplier_payment_batches.sql` para lotes de pago y sus partidas; las CLABEs solo las ve admin/administrativo.
- Tests RLS: `parts_inventory.sql` reescrita — la anterior usaba el rol inexistente `mecanico` y la columna `quantity`, por lo que validaba en falso.
- Docs: `supabase/tests/rls/README.md` con las 35 suites.

## 7.298.0 - 2026-08-11

- CI: se elimina la infraestructura de testing visual E2E que nunca se activo (e2e-visual-baselines.yml solo tenia workflow_dispatch y jamas corrio).
- CI: fuera visual-desktop.spec.ts, visual-mobile.spec.ts y el snapshot visual de bank-reconciliation.spec.ts; ~15 tests skipped menos por shard.
- CI: fuera el script test:e2e:update-snapshots, la opcion updateSnapshots/E2E_UPDATE_SNAPSHOTS y la variable E2E_VISUAL de ci.yml.
- Docs: tests/e2e/README.md sin la seccion de snapshots visuales.

## 7.297.2 - 2026-08-11

- CI: dependabot.yml pasa el frontend del ecosistema `npm` al `bun` para que regenere `bun.lock`; asi `bun install --frozen-lockfile` deja de fallar en changelog-check y bundle-size.
- CI: `commit-message: { prefix: chore, include: scope }` en ambos ecosistemas — titulos `chore(deps): bump ...` que pasan el lint de Conventional Commits.
- CI: `if: github.actor != 'dependabot[bot]'` en el job de pr-title.yml y en `version-sync` de changelog-check.yml (red de seguridad).
- Sin cambios en los gates de PRs humanos.

## 7.297.1 - 2026-08-11

- CI: `.github/workflows/rls-db-tests.yml` fallaba siempre en el step de arranque; la lista `-x` incluia `pgbouncer`, contenedor inexistente en la CLI 2.34.0 (reemplazado por `supavisor`).
- CI: exclusiones corregidas a nombres validos de 2.34.0; se conserva `gotrue` porque las suites RLS necesitan el schema `auth`.
- CI: el step ahora usa `set -euxo pipefail`, `--debug`, `timeout-minutes: 15` y `continue-on-error: false` explicito.
- CI: nuevo step `if: failure()` con `docker ps -a`, `supabase status` y logs de los contenedores `supabase_*`.
- Sin cambios en `db reset`, `scripts/run_sql_suites.py`, publicacion JUnit ni triggers/paths.

## 7.297.0 - 2026-08-11

- Perf (RLS): 234 policies del schema `public` recreadas con `(select auth.uid())` en vez de `auth.uid()` — la funcion STABLE pasa de evaluarse por fila a un InitPlan unico por query (evidencia EXPLAIN antes/despues en el comentario de la migracion, sobre `public.invoices`).
- Perf (RLS): nuevas funciones helper STABLE `is_admin_or_administrativo`, `is_admin_administrativo_auditor`, `is_ops_staff`, `is_backoffice` e `is_staff`; consolidan las OR-chains de `has_role` en un solo `EXISTS` sobre `user_roles`. 29 policies las usan.
- Sin cambio de semantica: mismos `TO`, mismos comandos, misma logica booleana. Las policies `TO public` conservan `has_role` inline porque los helpers solo tienen EXECUTE para `authenticated`/`service_role` (nunca `anon`).
- La migracion incluye una verificacion final que aborta si queda alguna policy con `auth.uid()` sin envolver. Estado verificado: 247 policies, 0 pendientes.

## 7.296.0 - 2026-08-11

- Tests: 12 suites RLS SQL nuevas en `supabase/tests/rls/` — bookings, deliveries, maintenance_logs, status_logs, activity_feed, collection_notes, collection_reminders_log, booking_extensions, quotes (back-office), contract_templates, rate_limits y storage.objects (bucket `documents`).
- Cada suite cubre anon, cliente del portal, staff según `role_permissions` y service_role donde aplica; todas terminan en `ROLLBACK;`.
- Fix: `quotes_portal.sql` usaba `customers.portal_user_id`, columna inexistente; ahora usa `customers.user_id` (convención desactualizada, no un bug de policy).
- Docs: `supabase/tests/rls/README.md` actualizado con las 33 suites y la convención de cambio de rol (`RESET ROLE`).

## 7.295.0 - 2026-08-11

- CI: nuevo workflow `.github/workflows/rls-db-tests.yml` (job `rls-db-tests`) — Fase 2 de supabase/tests/rls/README.md.
- CI: `supabase start` + `supabase db reset` aplican todas las migraciones desde cero y validan su orden.
- CI: las 21 suites RLS SQL corren con roles/JWT reales; resultados JUnit vía .github/actions/publish-test-results.
- CI: smoke SQL (c1_c2, r2, r3, r4, r9, r10) en modo informativo; se salta en PRs de forks y solo corre con cambios en supabase/** o src/**.
- Herramientas: `scripts/run_sql_suites.py` ejecuta suites SQL y emite JUnit.

## 7.294.0 - 2026-08-11

- Seguridad (Tema 1): company_settings con FORCE ROW LEVEL SECURITY, policies normalizadas a TO authenticated y (select auth.uid()).
- Seguridad (Tema 2): policy de storage.objects para clientes del portal usa coincidencia exacta de ruta ('documents/' || name) en vez de LIKE por sufijo.
- Seguridad (Tema 4): guards has_role en assert_invoice_cancellable, peek_next_invoice_number, assign_stamped_invoice_number/rep_number/credit_note_number, claim_maintenance_policy_month, damage_restore_forklift_status, has_active_rental y get_available_forklifts; REVOKE a anon/PUBLIC.

## 7.293.0 - 2026-08-11

- Seguridad: revocado EXECUTE a anon en todas las funciones SECURITY DEFINER salvo accept/reject_quote_from_portal y get_public_branding.
- Seguridad: get_portal_collection_account exige sesión; claim_payment_rep_stamping exige admin/administrativo o service_role.
- Funciones de folios, notificaciones y limpieza reservadas a service_role.

## 7.286.2 - 2026-08-10

- Seguridad: report_profit_by_model exige permiso Reportes/read.
- Pruebas: supabase/tests/r2_smoke.sql y tests de useInviteUser.

## 7.286.1 - 2026-08-10

- Entregas: se permite reprogramar una recolección pendiente cuando la reserva ya está completada (FIX-R2-11).
- Datos: backfills H7(b)/H8(b) verificados sin filas pendientes.

# Changelog

## 7.274.2 — 01/08/2026

Remediación del run de CI `83268379122` (2 jobs rojos) + hallazgo de seguridad.

- **E2E** `daterange-picker.spec.ts`: el filtro `hasText: /^\s*5\s*$/` podía apuntar a un día deshabilitado o fuera del mes visible, así que el clic no seleccionaba nada y `getByText(/selecciona fin/i)` no aparecía. Ahora se usan sólo `button:not([disabled])` y se afirma el estado (`aria-selected`) en lugar del texto de la etiqueta viva.
- **Knip**: eliminados exports sin uso — `useNextQuoteNumber`, `toMtyYMD`, `parseMtyDate` y el tipo `QuoteFormReturn`.
- **Seguridad (SUPA_security_definer_view)**: `public.v_overdue_invoices` era la única vista pública sin `security_invoker`, por lo que leía `invoices` con los privilegios del owner y saltaba RLS. Migración: `ALTER VIEW ... SET (security_invoker = on)`.

## 7.274.1 — 01/08/2026

Hallazgos de la verificación visual de R10 (Playwright con sesión).

- **R10-FE-02b** `DateRangePickerField`: el rango pedía **3 clics**. El guard de "reiniciar rango" (R6-FE-11c) se disparaba con `from == to`, que es el primer clic de react-day-picker. Lógica extraída a `nextRangeState()` / `isPartialRange()` (exportadas y con pruebas unitarias).
- **R10-FE-03b** `useQuotePrefill`: `rentalRateField()` deriva la periodicidad de la descripción legacy — una partida "— Renta mensual" de $20,000 caía en **Tarifa Diaria** y se multiplicaba por los días del periodo (COT-0002: `$640,000`→`$20,666`).
- Verificación en navegador: `/quotes/new` aplica el rango en 2 clics sin errores JS; `/quotes/:id/edit` (COT-0002, COT-0003) precarga cantidad y tarifa correctas.
- Nota: en partidas legacy donde `quantity` representaba meses (COT-0003) no hay metadato para distinguirlo de unidades; el usuario debe revisar la cantidad al reeditar.

## 7.274.0 — 01/08/2026

Auditoría R10: 4 bloqueantes + 2 P2 con diff.

- **R10-FE-01 (P0)** `RentalLineRow` / `SaleLineRow`: guard `if (!v) return` en `onValueChange` — el `BubbleSelect` de Radix emitía `""` al hidratar el form y corrompía las líneas precargadas.
- **R10-FE-03 (P1)** `useQuotePrefill.lineToRentalLineFallback`: lee `qty ?? quantity` y ya no sintetiza `dailyRate` desde `total` (total fantasma de $434,000 en COT-0001).
- **R10-DB-01 (P1 seguridad)** `expire_stale_quotes`: `REVOKE` de `anon`/`authenticated` + guard `auth.role() = 'service_role'`.
- **R10-FE-02 (P1)** `DateRangePickerField`: `from == to` es selección parcial (no auto-aplica); vuelve el botón **Aplicar** (habilitado con rango completo).
- **R10-FE-04 (P2)** `InviteUserDialog`: `inFlightRef` contra doble submit.
- **R10-DB-02**: no aplica — la línea `v_starts_today := p_start_date <= CURRENT_DATE` vive en `create_booking`, no en `start_repair_work_order`, y ya usa `today_mty()` desde R9. Verificado en `supabase/tests/r10_smoke.sql`.
- Verificación: `tsgo --noEmit` limpio, tests de cotizaciones en verde (+3 nuevos), E2E `daterange-picker.spec.ts` actualizado.

## 7.273.5 — 01/08/2026

Refactor de complejidad ciclomática: 0 warnings `complexity` (umbral 15), sin cambios de comportamiento.

- `DamageActions.tsx` (26 → <15): permisos en `useDamagePermissions` + `damageArchiveBlockReason`; UI en `DamageActionButtons` / `DamageBlockReasons`.
- `DeliveryDetail.tsx` (18 → <15): tarjetas en `DeliveryDetailBody`; regla de borrado en `canDeleteDeliveryFor()`.
- `useDashboardSections.ts` (16 → <15): helpers puros `dashboardAccess()` y `mergeFleetCounts()`.
- `PortalDashboard.tsx` (17 → <15): KPIs derivados en `derivePortalKpis()` (`features/portal/lib/portalKpis.ts`).
- Verificación: `eslint` 0 errores / 0 warnings de complejidad, `tsgo --noEmit` limpio, 1467 tests en verde.

## 7.273.4 — 01/08/2026

Calidad de código: `bun run lint` en verde.

- `supplierBillColumns.approval.test.tsx`: el hook se llama dentro de un componente `ApprovalCell` (error `react-hooks/rules-of-hooks`).
- `FormActions.tsx`: `useCallback` para los timers; se eliminan los `eslint-disable` que bloqueaban el React Compiler.
- `useQuotePrefill.ts`: caché por `quoteId` como estado derivado en render (adiós `react-hooks/refs`).
- `AuthGuard.tsx`: reset de `timedOut` como estado derivado en vez de `setState` en efecto.
- `import-x/order` autofix y `eslint-disable` justificados en los specs de Playwright.

## 7.273.3 — 01/08/2026

Estabilidad del selector de rango de fechas.

- `DateRangePickerField`: `DialogContent` pasa de `max-w-fit` a ancho fijo (`w-fit min-w-[22rem]`) y la etiqueta viva tiene alto fijo. Evita el reflow/re-centrado del diálogo al elegir la fecha inicial.
- `tests/e2e/daterange-picker.spec.ts`: helper `clickDay()` que espera visibilidad y fuerza el clic; elimina el fallo intermitente "element is not stable / detached" en CI.

## 7.273.2 — 01/08/2026

Auditoría Ronda 9 · Cierre: cobertura de pruebas.

- E2E `tests/e2e/quote-edit-prefill.spec.ts`: recorre lista → detalle → editar y verifica que los valores precargados sobreviven la ventana de ~1.5 s en la que el `reset()` tardío los borraba (condición NO-GO del documento R9).
- `supabase/tests/r9_smoke.sql`: valida `today_mty()`, ausencia de `CURRENT_DATE` en funciones de negocio, `v_overdue_invoices` sobre `today_mty()`, `quotes.rejected_at` poblado y CxP sin aprobación huérfana. Ejecutado contra el entorno: 5/5 OK.
- Nuevas pruebas unitarias (40): `deriveForkliftDisplayStatus`, `buildLabel` (bitácora), `resolveDeliveryForkliftName`, columna de aprobación de CxP, esquema de sobrepago del portal, `useQuote` con `maybeSingle()`, `setStatus` con `rejected_at` y gate de `ProspectHistoryCard`.
- E2E de `DateRangePickerField`: confirma auto-aplicación al completar el rango y ausencia del botón "Aplicar".
- Bitácora: `actorLabel()` distingue "Sistema" (sin `actor_id`) de un usuario no identificado (`Usuario <id corto>`).
- Refactor de apoyo: se extrajeron `deriveForkliftDisplayStatus` y `resolveDeliveryForkliftName` desde las páginas para poder probarlos sin montarlas.

## 7.273.1 — 01/08/2026

Auditoría Ronda 9 · Fase 2: los 7 detalles P2.

- Cotizaciones: `rejected_at` al rechazar; detalle con `maybeSingle()` (fin del 406 tras borrar).
- CxP: la columna de aprobación deja de mostrar "Por aprobar" en facturas pagadas o canceladas.
- Portal: el sobrepago indica el saldo pendiente exacto y el botón permanece habilitado para dar retroalimentación.
- Bitácora: nombres y roles legibles en lugar de identificadores hexadecimales.
- Entregas: el nombre del montacargas se toma del join de la consulta, con el mapa de flota como respaldo.
- Filtros: `DateRangePickerField` se aplica solo al completar el rango.

## 7.273.0 — 01/08/2026

Auditoría Ronda 9 (pre-release): cierre de los 6 bloqueantes.

- Cotizaciones (P0): hidratación reactiva del formulario (`values` de RHF) en lugar de `reset()` one-shot — se acabó la pérdida de partidas al navegar lista → detalle → editar. Fallback para cotizaciones legacy sin `rental_meta`.
- Base de datos: nueva función `today_mty()` como única fuente de "hoy"; se reemplazó `CURRENT_DATE` (UTC) en indicadores, `v_overdue_invoices`, alertas, contadores y validaciones.
- Frontend: defaults de fecha en zona horaria de Monterrey (devoluciones, entregas, mantenimiento, CxP, vigencia de cotización).
- CRM: `ProspectHistoryCard` permite el rol Ventas sin exponer el módulo Auditoría.
- Flota: badge del detalle derivado con `computeFleetAvailability`.
- Formularios: guard anti doble submit robusto (liberación con debounce + timeout de seguridad, ahora en `onClick`).
- Rutas: `/customers/new` redirige al alta por diálogo; identificadores no-UUID muestran "no encontrado".

## 7.272.0 — 31/07/2026

Auditoría Ronda 8: permisos restaurados, cierre de OT blindado y detalles de interfaz.

- Base de datos: se recrearon las reglas de lectura perdidas (Mecánico: reservas y extensiones; Ventas: historial de prospectos, acotado a prospectos), se agregó el candado en el servidor que impide cerrar órdenes de trabajo con daños abiertos y un diagnóstico de coherencia de cuentas por pagar.
- Interfaz: tab "Vencido" alineado con el Panel, datos financieros de unidad sólo para roles autorizados, botón "Cerrar OT" bloqueado con daño abierto, edición de cotizaciones sin perder partidas, motivo obligatorio al rechazar cotización, duración cotizada inclusiva, KPIs de cuentas por pagar corregidos, fechas del portal y de inspección en zona horaria de Monterrey, traducciones en bitácora/conciliación/pagos, mejor contraste y objetivos táctiles de 44px.

## 7.261.0 — 29/07/2026

- Cotizaciones: nuevo estado `cancelled` y transición `accepted → cancelled` restringida a admin/administrativo y sin reservas `confirmed` ligadas (DB3-08).
- `guard_quote_delete`: mensaje corregido (cancelar en vez de "rechazar") conservando la exención de teardown E2E (`app.e2e_teardown` + `is_e2e` + `e2e_scope`).
- UI: filtro de estado de cotizaciones incluye "Cancelada".

## 7.260.3 — 29/07/2026

- E2E: `e2e_teardown` marca su ejecución interna para que `guard_quote_delete` permita borrar únicamente cotizaciones `is_e2e` con `e2e_scope`, manteniendo bloqueado el borrado de cotizaciones aceptadas reales.

## 7.260.2 — 29/07/2026

- Refactor: `PortalInvoiceDetail` delega datos y totales a `usePortalInvoiceDetailData` y el resumen a `InvoiceSummaryCards`; se elimina la advertencia de ESLint por complejidad 17.

## 7.260.1 — 29/07/2026

- E2E: `e2e_seed_scenario` siembra la cotización en `draft` y la transiciona a `accepted`, alineándose con el trigger `validate_transition` (13 specs del shard 1/2 volvían a fallar en la siembra).
- Entregas: `validate_delivery_not_in_past` exime a las entregas registradas como `completed` (captura histórica).

## 7.260.0 — 29/07/2026

- DB2-06/07: `change_forklift_status` como flujo oficial de cambio de estado del equipo + guard de tabla; la bandera `is_e2e` deja de servir para evadir auditoría.
- DB2-08/09: notas de crédito con montos positivos y cuadre aritmético; pagos a proveedor exigen aprobación también por PostgREST.
- DB2-10/11: entregas no se pueden mover al pasado; rescatar cotización vencida exige nueva vigencia y no se reenvían cotizaciones caducas.
- DB2-12/19: los daños recuerdan y restauran el estado previo del equipo, no se archivan/borran sin cargo, y la re-inspección con daño nuevo se rechaza explícitamente.
- DB2-13/14/15: `supplier_bills.total` no baja de lo pagado, las partidas cuadran con el subtotal (±0.05) y se rechazan pagos sobre facturas en borrador.
- DB2-16/17/18: dominio de `deliveries.status`, contratos sin tasas/depósito negativos ni fechas incoherentes, y bloqueo de borrado de cotizaciones aceptadas o con reservas.
- DB2-20/21: regresiones `paid→sent/partial` sólo vía sync de pagos; sin lockout del último admin activo y exención e2e limitada a `@liftgo.test`.

## 7.255.0 — 29/07/2026

- R23-G: nueva RPC `reorder_prospect_stage` que reindexa `stage_order` de la columna origen y destino en una sola transacción (sin duplicados `#0`).
- R23-H: el reorder dentro de la misma columna usa `useMoveProspectStage` (optimista + reindexado) en lugar de un update plano.
- R23-I: soltar en el área vacía de una columna coloca la tarjeta al final, no al inicio.
- R23-J: `parseBankCsv` valida el número mínimo de columnas por perfil y reporta el renglón corrido con mensaje accionable.
- R23-F: `useRecordPaymentForm` resetea Referencia/Notas/Método/Fecha/Forma SAT al reabrir y los incluye en `isDirty`.

## 7.254.0 — 29/07/2026

- R23-1: se restauraron 10 celdas de dinero que se renderizaban vacías (proveedores, pólizas, reportes de costos/antigüedad/ingresos y portal) + guard automático `moneyCellRegression.test.ts`.
- R23-2: la vista de impresión libera `height`/`overflow` del shell `h-[100dvh]`, evitando el recorte del contenido.
- R23-A: `FormDialog` expone `requestClose` por contexto; el botón "Cancelar" de `FormActions` respeta el aviso de cambios sin guardar.
- R23-B: `ProspectFormDialog` espera el guardado antes de cerrar y conserva la captura si falla.
- R23-C: `useMoveProspectStage` sólo invalida cuando no quedan movimientos en vuelo (sin rebotes al arrastrar rápido).
- R23-D: KPIs de Cuentas por Pagar usan `kpiSizeClass` para montos largos.
- R23-E: `parseAmount` interpreta correctamente la coma decimal es-MX ("1.500,50" → 1500.50).

## 7.253.4 — 29/07/2026

- Se aisló la limpieza de datos E2E para que las ejecuciones paralelas de CRM y conciliación bancaria no borren escenarios activos.
- La prueba del Kanban ahora espera la confirmación de persistencia antes de recargar la página.
