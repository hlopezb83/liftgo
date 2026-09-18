# Multiempresa · Tramo 9 — Alta de empresas, suspensión, clientes y portal por empresa

## Estado actual (2026-09-18)

> Este bloque es el **estado vigente**. Las secciones siguientes son
> **snapshots históricos fechados** de las auditorías previas y se conservan
> tal cual para trazabilidad: no describen la situación de hoy.

- Migraciones **0030–0035 aplicadas** a la base conectada por el canal oficial.
- **Operador raíz asignado** (exactamente 1 operador de plataforma); 5 membresías.
- **Migración de Storage completada**: 293 referencias actualizadas, 0 pendientes,
  0 fallos; 17 huérfanos copiados y verificados; **1 resolución manual activa**.
- **Originales conservados** (632 objetos = 322 originales + copias). El borrado
  de fuentes sigue **deshabilitado** y sin autorización.
- **1 sola organización activa**.
- **1 referencia fuera del Storage del proyecto, clasificada el 2026-09-18**: el
  valor de `company_settings.logo_url` es una **imagen pública HTTPS alojada
  fuera del proyecto**, no un archivo subido al Storage de la empresa (no tiene
  forma `/storage/v1/object/...` ni prefijo de organización). Según la
  aclaración del propietario corresponde a la **marca global de LiftGo**, un
  asset **compartido deliberadamente por todas las empresas**. No se publica su
  valor, host, ruta, token ni identificadores.
  - **No requiere traslado a Storage** ni entra en el inventario de objetos a
    migrar: no es dato de un tenant.
  - **No requiere prueba A/B de aislamiento**: por diseño todas las empresas ven
    la misma marca.
  - Lo que sí se verifica: la carga usa una fuente fija y permitida —sólo HTTPS,
    como imagen estática, **sin credenciales, sin cookies y sin referer**, tanto
    en pantalla como al generar PDF—, y nunca un fetch arbitrario con sesión.
    `http:` en claro, `data:`, `blob:` y rutas con salto de nivel se rechazan
    fail-closed.
  - **El logo subido por una empresa es otro caso distinto** y conserva
    aislamiento por tenant: se guarda como ruta dentro del prefijo de su
    organización y se resuelve firmando con la sesión actual (TTL 300 s), de
    modo que las policies impiden que una empresa muestre el logo de otra.

### Gates obligatorios antes de dar de alta una segunda empresa

1. **Branding por empresa resuelto y probado**: el logo **subido por una
   empresa** se sirve desde la `company_settings` de la organización del
   contexto y se firma con TTL corto (probado A/B). La **marca global de
   LiftGo** queda fuera de este gate: es un asset compartido a propósito.
2. **Ensayo A/B aislado** (empresas de prueba) cubriendo datos, Storage y portal.
3. **CI completo en verde** (RLS, smoke SQL, Deno, tipos, lint, build).
4. **Recuperación verificada**: respaldo reciente **y restauración ensayada**
   documentada. Hoy hay respaldo diario, pero **no** hay restore ensayado.

---

### Snapshot histórico (previo a 2026-09-18)

Estado en ese momento: implementado en el repositorio (8.19.3), sin producción; las
migraciones `0030`–`0034` figuraban en el journal y **pendientes de aplicar**, y
el ledger sólo acreditaba ids 25–30 = archivos `0024`–`0029` (el id 31 extra es
una anomalía histórica sin identificar). Superado: 0030–0035 ya están aplicadas.

> **Tramo 10 (0031)** endurece este tramo tras la auditoría: autoridad de
> plataforma **explícita** (sin promoción automática de administradores de
> empresa), alta en **dos tiempos** (empresa inactiva hasta tener su primer
> administrador), clientes sólo para **membresía interna** y Storage con
> prefijo de empresa activa **obligatorio**.

## Qué cierra este tramo

| Brecha (auditoría previa)                                              | Cierre                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No había forma de crear una segunda empresa ni su primer administrador | Operadores de plataforma + funciones `platform_*` + pantalla "Empresas"                                                                                 |
| Una empresa no podía suspenderse                                       | `organizations.is_active` gobierna todo el contexto; motivo `organization_inactive` en el navegador                                                     |
| Clientes: el personal leía la tabla global                             | Policies de `customers` acotadas a la relación comercial de SU empresa; alta fija `created_by_organization_id`; vínculo por RFC; archivado por relación |
| Portal: "acceso activo" salía de `customers.user_id` global            | Se evalúa sobre `customer_portal_accounts (organization_id, customer_id)`                                                                               |
| Cobertura RLS por listas estáticas                                     | Suite dinámica `multi_org_scope_coverage.sql` sobre `information_schema`/`pg_policies`                                                                  |

## Modelo de autorización

```text
navegador ── server function ── requirePlatformOperator ── RPC platform_* (service_role)
                 │                    │                          │
                 │                    ├ is_active_user            ├ assert_platform_operator(p_actor)
                 │                    ├ has_role(admin)           │  (vuelve a verificar en la base)
                 │                    ├ membresía interna activa  │
                 │                    └ is_platform_operator()    │
                 └ nunca envía organization_id ni decide permisos
```

- `platform_operators`: quién puede operar la plataforma. **La autoridad de
  plataforma NO se deriva del rol `admin` de una empresa.** 0031 retira el
  respaldo automático de 0030 (borra únicamente las filas con el marcador
  exacto de aquel seed y conserva cualquier asignación explícita). RLS: cada
  operador ve únicamente su propia fila.

### Bootstrap seguro del primer operador

No hay forma de volverse operador desde la aplicación. El primer operador se
asigna una sola vez con el canal privilegiado (`service_role`), nombrando al
usuario de forma explícita:

```sql
-- Ejecutado por el propietario del proyecto con el canal privilegiado.
INSERT INTO public.platform_operators (auth_user_id, notes)
VALUES ('<uuid del usuario>', 'Operador raíz: alta manual autorizada')
ON CONFLICT (auth_user_id) DO NOTHING;
```

A partir de ahí la alta y baja son explícitas y auditables:
`platform_grant_operator(p_actor, p_user_id, p_notes)` y
`platform_revoke_operator(p_actor, p_user_id)` (ambas sólo `service_role`,
ambas exigen `assert_platform_operator(p_actor)`; nadie puede retirarse la
autoridad a sí mismo).

- `is_platform_operator()` (SECURITY DEFINER, `authenticated`): responde sólo
  por el usuario autenticado. La UI lo usa para **mostrar** la sección; nunca es
  la barrera.
- `platform_create_organization`, `platform_attach_first_admin`,
  `platform_discard_organization`, `platform_set_organization_active`,
  `platform_list_organizations`: sólo `service_role`; cada una exige
  `assert_platform_operator(p_actor)`. `authenticated` y `anon` no tienen
  EXECUTE (verificado por `multi_org_onboarding.sql`).
- `requirePlatformOperator` (`adminGuards.server.ts`): cuenta activa, rol
  `admin`, membresía interna de una empresa activa y `is_platform_operator() = true`
  con el cliente del propio usuario. Cualquier error de lectura responde 503
  (fail-closed); sólo después se carga el cliente privilegiado.

## Alta de una empresa (`createOrganizationFn`)

1. Guard de operador + rate limit (5 altas / 5 min por operador) + validación
   (`name` 2–120, `slug` `^[a-z0-9][a-z0-9-]{1,62}$`, correo válido, nombre ≤ 200).
2. Unicidad de correo en `profiles` (mismo criterio que la invitación interna).
3. `platform_create_organization` → empresa **inactiva (pending)**: nace con
   `is_active = false`, así que mientras el alta esté incompleta nadie opera en
   ella, ni por RLS ni por Storage (0031).
4. `auth.admin.createUser` con `user_metadata.organization_id` para que
   `handle_new_user` fije el contexto de auditoría. **Si falla**, se ejecuta
   `platform_discard_organization` (la empresa recién creada no queda a medias).
5. `platform_attach_first_admin` → membresía interna + rol `admin` + perfil
   activo y, **en la misma transacción y sólo después de comprobar que la
   membresía interna quedó escrita**, `is_active = true`. Un segundo "primer
   administrador" se rechaza. Si falla, se compensa (usuario Auth + empresa) y
   la empresa permanece inactiva.

6. Enlace de recuperación de un solo uso para que el administrador defina su
   contraseña; si no se puede generar, la respuesta lo indica y el administrador
   puede usar "Olvidé mi contraseña".

La compensación respeta la auditoría inmutable: no borra filas de bitácora.

## Suspensión (`setOrganizationActiveFn`)

- Sólo un operador; no puede suspender su propia empresa.
- `organization_scope_matches` / `resolve_organization_context` ignoran
  organizaciones inactivas: sus miembros internos y cuentas de portal dejan de
  leer y escribir de inmediato (RESTRICTIVE `org_scope_isolation` + trigger de
  contexto de escritura).
- `trg_organization_active_flag`: sólo el operador (vía `platform_set_organization_active`)
  cambia `is_active`; un administrador de empresa no puede reactivarse solo.
- El navegador (`resolveOrganizationContext`) verifica `organizations.is_active`
  antes de aceptar membresía o cuenta de portal y muestra
  "La empresa de tu cuenta está suspendida o no está disponible."
- Los datos se conservan; la reactivación restituye el acceso sin migración.

## Clientes por empresa

- `customers` sigue siendo identidad global (RFC único). `created_by_organization_id`
  se fija en el alta (`trg_customer_owner_organization`) y no cambia.
- `ensure_single_active_organization_customer` crea la relación comercial para
  la empresa del usuario que da de alta. Un proceso sin JWT con varias empresas
  activas no adivina: fija el dueño desde `app.organization_id` y la relación se
  declara explícitamente (fixtures A/B y migraciones).
- Policies de personal (`admin`, `administrativo`, `ventas`, `auditor`,
  `dispatcher`) usan `customer_scope_matches(customer_id, organization_id)`. Con
  0031 el helper exige **membresía interna verificada de una empresa activa**
  (`current_internal_organization_id()`) y niega a toda cuenta de portal, aunque
  conserve un rol administrativo residual. No hay compatibilidad de "una sola
  empresa activa" para usuarios autenticados: sin membresía, falla cerrado.
- `link_customer_to_organization_by_rfc`: si el RFC ya existe (dado de alta por
  otra empresa), crea la relación en la empresa actual en lugar de fallar por
  duplicado; los datos por relación viven en `organization_customers`.
- `soft_delete_customer` (SECURITY DEFINER): exige usuario autenticado, membresía
  interna y empresa activa; sin contexto de organización **no archiva nada**
  (0031 eliminó la rama global). Archivado por relación cuando el cliente está
  compartido; archivado de la identidad global sólo cuando la empresa es el
  único dueño con relación vigente. Las relaciones y cuentas de portal que toca
  se limitan a la empresa actual; las validaciones de reservas y saldo se
  evalúan sobre los datos de esa empresa.

- Frontend (`useCustomers`): listado y detalle leen a través de
  `organization_customers` con `customers!inner(...)` y relación `active`; un
  cliente de otra empresa es indistinguible de uno inexistente.

## Portal por empresa

- Invitación (`inviteCustomerFn`): el permiso es la relación comercial activa
  con ESTA empresa; "ya tiene acceso" se decide por `customer_portal_accounts`
  de esta empresa (activa o suspendida). El vínculo legado `customers.user_id`
  sólo cuenta si ese usuario no tiene cuenta de portal y su membresía es de
  esta empresa, y sólo se escribe si estaba vacío (nunca se pisa el de otra
  empresa).
- Indicador "acceso activo" (`useCustomerPortalAccount`): consulta
  `customer_portal_accounts` bajo RLS (`portal_accounts_select` acota a la
  empresa del personal).
- La cuenta de portal de B es invisible para A (`multi_org_onboarding.sql`).

## Pruebas

| Capa             | Archivo                                                                                   | Cubre                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RLS (CI efímero) | `supabase/tests/rls/multi_org_onboarding.sql`                                             | catálogo/ACL de 0030, alta de B por operador, primer admin atómico, `handle_new_user` con varias empresas, aislamiento de clientes A/B, vínculo por RFC, archivado por relación, portal por empresa, suspensión                                                                                                                                                          |
| RLS (CI efímero) | `supabase/tests/rls/multi_org_scope_coverage.sql`                                         | cobertura dinámica: toda tabla pública de negocio con `organization_id` tiene `org_scope_isolation` + trigger de contexto; las que no lo tienen están en la allowlist explícita; RLS habilitada en todas                                                                                                                                                                 |
| Vitest           | `src/lib/server/__tests__/requirePlatformOperator.test.ts`                                | guard fail-closed (403/503), no-admin, cuenta desactivada, empresa suspendida, cuenta de portal                                                                                                                                                                                                                                                                          |
| Vitest           | `src/lib/organization/__tests__/resolveOrganizationContext.test.ts`, `adminScope.test.ts` | organización suspendida/no visible, errores de lectura, cuentas de portal                                                                                                                                                                                                                                                                                                |
| Vitest           | `src/layouts/hooks/__tests__/useVisibleNavGroups.test.tsx`                                | "Empresas" oculta sin confirmación del servidor                                                                                                                                                                                                                                                                                                                          |
| Vitest           | `src/features/customers/.../useCustomers.rls.test.ts`                                     | detalle vía relación comercial; sin relación → `null`                                                                                                                                                                                                                                                                                                                    |
| RLS (CI efímero) | `supabase/tests/rls/audit_hardening_0031.sql`                                             | portal con rol `admin` residual y admin sin membresía: no listan clientes ni archivan (y no cambian datos ajenos); `organization_document_counters` con RLS deny-all y ACL sólo `service_role`; retiro del seed de operadores y ACL de `platform_*`; admin de empresa no puede crear ni suspender empresas; alta en dos tiempos (empresa inactiva hasta el primer admin) |
| RLS (CI efímero) | `supabase/tests/rls/storage_strict_org_prefix_0031.sql`                                   | Storage con dos empresas: SELECT/INSERT/UPDATE/DELETE; prefijo ajeno, prefijo desconocido y legado sin prefijo denegados; empresa suspendida sin acceso por Storage API; `service_role` conserva el acceso del migrador                                                                                                                                                  |
| Deno             | `supabase/functions/_shared/storageQuarantine_test.ts`                                    | cuarentena agregada del migrador: sin dueño, conflicto, lectura incompleta o cubeta no soportada nunca quedan "listos"                                                                                                                                                                                                                                                   |

## Pendiente (fuera de este tramo)

- Rollout de 0030 **y 0031–0034** a la base conectada: **requiere
  autorización explícita**. Preflight igual que 0024–0029 (journal, backup del
  día, sin restore ensayado). En este repositorio todas son **dry-run**: nada
  se aplicó; 0031–0034 están preparadas pero **pendientes (no ejecutadas)**.
- Asignar explícitamente el primer `platform_operator` tras aplicar 0031
  (bootstrap manual): 0031 borra el respaldo automático del seed y **nadie
  queda como operador** hasta que el propietario haga la alta manual
  documentada arriba.
- Regenerar `src/integrations/supabase/types.ts` tras aplicar 0030–0034;
  mientras tanto las RPC de plataforma se invocan sin tipado generado
  (`asUntypedRpc`) con el contrato fijado en el servidor.
- Alta real de la segunda empresa y prueba cross-tenant en producción (Storage,
  branding por empresa) siguen abiertas; ver `storage-historico.md`. Con 0031
  el Storage legado deja de ser legible para el personal, así que antes de
  habilitar la segunda empresa hace falta: **dry-run completo** del migrador
  (modo `plan`, sólo agregados) y **resolver o contener los históricos** —
  traslado copy → verify → update references → observe → delete, con el
  huérfano sin coincidencia resuelto manualmente vía la tabla de 0034 (fuente
  intacta hasta una aprobación separada).

## Tramo 12 (8.18.0) · El contexto de empresa del alta deja de leerse de `user_metadata`

**Hallazgo (auditoría, condicional).** En 0030 `handle_new_user` tomaba
`NEW.raw_user_meta_data->>'organization_id'` y lo fijaba como
`app.organization_id` de la transacción. `user_metadata` es un canal escribible
por el propio usuario (`auth.signUp(..., { data })` y `auth.updateUser`), así
que en un escenario con registro público habilitado una cuenta podía declarar
bajo qué empresa se auditaba su alta.

**Cierre (migración forward-only `0033_handle_new_user_trusted_org_context.sql`,
journal idx 33).** El contexto sólo se acepta desde `raw_app_meta_data`, que
únicamente puede escribir el service role (Auth Admin API). Cualquier
`organization_id` presente en `raw_user_meta_data` se ignora por completo;
de ahí sólo se sigue leyendo `full_name`, dato descriptivo. La migración se
verifica a sí misma con `pg_get_functiondef`: aborta si el cuerpo instalado
vuelve a leer la organización de `raw_user_meta_data` o no usa
`raw_app_meta_data`. El trigger sigue sin crear membresías.

**Canal de alta actualizado.** `src/lib/userAdmin.functions.ts`,
`src/lib/customerPortal.functions.ts` y `src/lib/platformAdmin.functions.ts`
envían ahora `app_metadata: { organization_id }` en `auth.admin.createUser`
(el `full_name` queda en `user_metadata`). Los guards no se relajaron: la
empresa nace pendiente/inactiva y sólo se activa al adjuntar a su primer
administrador por `platform_attach_first_admin`.

**Evidencia de la configuración real de registro (2026-09-18, sólo lectura).**
`POST /auth/v1/signup` con la clave publicable de producción responde
`422 {"error_code":"signup_disabled","msg":"Signups not allowed for this
instance"}`, y el código de la aplicación no llama a `supabase.auth.signUp` en
ninguna ruta. Es decir, hoy el vector no es alcanzable desde fuera; aun así se
cerró en la base para no depender de esa configuración.

**Prueba.** `supabase/tests/rls/handle_new_user_trusted_org_context.sql`
(dos empresas): un alta cuyo `raw_user_meta_data.organization_id` apunta a la
empresa B no mueve el contexto (sigue en A), no genera filas de `audit_logs`
atribuidas a B y no crea membresías; el alta por `raw_app_meta_data` sí fija el
contexto correcto aunque el `user_metadata` mienta, y la empresa B pendiente
completa su alta y queda activa. Control negativo: reinstalado el cuerpo
anterior, la prueba lo detecta. Resultado local: **62/62 suites RLS** en verde.
Sin producción: 0030–0034 siguen sin aplicarse a la base conectada.
