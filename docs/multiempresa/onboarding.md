# Multiempresa · Tramo 9 — Alta de empresas, suspensión, clientes y portal por empresa

Estado: **implementado en el repositorio (8.16.0), sin producción**. Las
migraciones `0030_multi_org_onboarding_and_customer_scope.sql` (idx 30) y
`0031_multi_org_audit_hardening.sql` (idx 31) están en el journal y sólo se
ejecutan en CI efímero. Su rollout a la base conectada requiere autorización
explícita y sigue el mismo canal oficial que 0024–0029.

> **Tramo 10 (0031)** endurece este tramo tras la auditoría: autoridad de
> plataforma **explícita** (sin promoción automática de administradores de
> empresa), alta en **dos tiempos** (empresa inactiva hasta tener su primer
> administrador), clientes sólo para **membresía interna** y Storage con
> prefijo de empresa activa **obligatorio**.


## Qué cierra este tramo

| Brecha (auditoría previa) | Cierre |
| --- | --- |
| No había forma de crear una segunda empresa ni su primer administrador | Operadores de plataforma + funciones `platform_*` + pantalla "Empresas" |
| Una empresa no podía suspenderse | `organizations.is_active` gobierna todo el contexto; motivo `organization_inactive` en el navegador |
| Clientes: el personal leía la tabla global | Policies de `customers` acotadas a la relación comercial de SU empresa; alta fija `created_by_organization_id`; vínculo por RFC; archivado por relación |
| Portal: "acceso activo" salía de `customers.user_id` global | Se evalúa sobre `customer_portal_accounts (organization_id, customer_id)` |
| Cobertura RLS por listas estáticas | Suite dinámica `multi_org_scope_coverage.sql` sobre `information_schema`/`pg_policies` |

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
  `dispatcher`) usan `customer_scope_matches(customer_id, organization_id)`: el
  personal sólo ve clientes con relación comercial en SU empresa.
- `link_customer_to_organization_by_rfc`: si el RFC ya existe (dado de alta por
  otra empresa), crea la relación en la empresa actual en lugar de fallar por
  duplicado; los datos por relación viven en `organization_customers`.
- `soft_delete_customer`: archivado por relación cuando el cliente está
  compartido; archivado global sólo cuando la empresa es el único dueño.
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

| Capa | Archivo | Cubre |
| --- | --- | --- |
| RLS (CI efímero) | `supabase/tests/rls/multi_org_onboarding.sql` | catálogo/ACL de 0030, alta de B por operador, primer admin atómico, `handle_new_user` con varias empresas, aislamiento de clientes A/B, vínculo por RFC, archivado por relación, portal por empresa, suspensión |
| RLS (CI efímero) | `supabase/tests/rls/multi_org_scope_coverage.sql` | cobertura dinámica: toda tabla pública de negocio con `organization_id` tiene `org_scope_isolation` + trigger de contexto; las que no lo tienen están en la allowlist explícita; RLS habilitada en todas |
| Vitest | `src/lib/server/__tests__/requirePlatformOperator.test.ts` | guard fail-closed (403/503), no-admin, cuenta desactivada, empresa suspendida, cuenta de portal |
| Vitest | `src/lib/organization/__tests__/resolveOrganizationContext.test.ts`, `adminScope.test.ts` | organización suspendida/no visible, errores de lectura, cuentas de portal |
| Vitest | `src/layouts/hooks/__tests__/useVisibleNavGroups.test.tsx` | "Empresas" oculta sin confirmación del servidor |
| Vitest | `src/features/customers/.../useCustomers.rls.test.ts` | detalle vía relación comercial; sin relación → `null` |

## Pendiente (fuera de este tramo)

- Rollout de 0030 a la base conectada: **requiere autorización explícita**.
  Preflight igual que 0024–0029 (journal, backup del día, sin restore ensayado).
- Regenerar `src/integrations/supabase/types.ts` tras aplicar 0030; mientras
  tanto las RPC de plataforma se invocan sin tipado generado
  (`asUntypedRpc`) con el contrato fijado en el servidor.
- Alta real de la segunda empresa y prueba cross-tenant en producción (Storage,
  branding por empresa) siguen abiertas; ver `storage-historico.md`.
