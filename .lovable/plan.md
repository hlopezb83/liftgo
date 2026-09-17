# Auditoría de solo lectura — precondición de rollout 0025 → 0026

Estado: propuesta. No se editó código, no se ejecutó DDL ni escritura alguna en producción (proyecto zxefrzfaynnfwazqhwxp). Todas las evidencias provienen de consultas SELECT de introspección y de lectura de archivos del repositorio.

En términos simples: la migración 0026 (el "candado" del folio REP) usa una herramienta que todavía no está instalada en producción. Esa herramienta la instala la migración 0025. Aplicar 0026 sola no falla al instalarse, pero el candado se rompe justo cuando lo usa una persona con sesión.

## 1. Resultado observado: qué hay y qué falta (0021–0026)

Registro de migraciones aplicadas (`select id, hash, to_timestamp(created_at/1000) from drizzle.__drizzle_migrations order by id`): 24 entradas, la última el 2026-09-15 17:52:34Z con hash `9ee7719a…`, que corresponde byte a byte a `0023_payment_intent_invoice_definer_check.sql`.

| Migración | Estado en producción | Evidencia |
|---|---|---|
| 0021 storage prefix-aware | Aplicada | hash `e7ffb693…` en el registro; existe `public.storage_relative_segments(p text)` |
| 0022 storage tenant-scoped | Aplicada | hash `7cbe5fe7…`; existen `storage_prefix_organization(text)`, `storage_path_in_current_organization(text,boolean)`, `invoice_in_current_organization(uuid)`, `payment_proof_path_allowed(text,boolean)`; 25 policies en `storage.objects` (8 SELECT) |
| 0023 payment intent definer check | Aplicada | hash `9ee7719a…`; existe `invoice_eligible_for_payment_intent(uuid)` |
| 0024 portal fallback account status | **Pendiente** | su hash `1a6bd55e…` no está en el registro; `get_customer_id_for_user(uuid)` existe pero con la definición previa |
| 0025 admin/membership scope | **Pendiente** | no existen `is_internal_member(uuid)` ni `user_in_current_organization(uuid)`; `current_organization_id()` conserva el cuerpo viejo con `LIMIT 1`; policies viejas intactas |
| 0026 folio REP org-scoped | **Pendiente** | solo existe `assign_stamped_rep_number(uuid, text)`; no existe la firma de 3 parámetros |

Hallazgo verificado por introspección directa de `pg_policies`: el ámbito administrativo de 0025 **tampoco está aplicado** en producción.

Policies vigentes en `profiles` (todas globales, pre-0025): "Staff can view all profiles", "Admins update any profile", "Administrativo update any profile", "Auditor read profiles", "Ventas read profiles". Faltan las policies org-scoped que crea 0025.

Policies vigentes en `user_roles` (todas globales, pre-0025): "Admins can manage all roles" (ALL), "Only admins can modify roles", "Only admins can update roles", "Only admins can delete roles", "Auditor read user_roles", "Users can view own roles". Faltan "Admins insert org roles", "Admins update org roles" y el resto de policies por organización. No aparece policy `org_scope_isolation` para estas tablas en la consulta.

Matiz de interpretación: los helpers preexistentes `current_organization_id()`, `is_ops_staff()`, `assert_not_last_admin()` y `update_user_role_safe()` sí existen, pero `is_internal_member()` y `user_in_current_organization()` no. La presencia de algunos helpers **no prueba** que 0025 esté aplicada; los nombres de policies verifican lo contrario. La consulta que lo confirma:

```sql
select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename in ('profiles','user_roles') order by 1,2;
-- esperado tras 0025: nombres org-scoped ("Admins insert org roles", "Admins update org roles", …);
-- observado hoy: solo nombres globales pre-0025.
```

Observación de integridad del carril Drizzle: cuatro entradas antiguas del registro (ids 5, 6, 7, 10) tienen hash distinto al archivo actual (`0004`, `0005`, `0006`, `0010` fueron editados después de aplicarse). El migrador de Drizzle avanza por marca de tiempo, no por hash, así que no las reaplica; pero conviene saberlo antes de cualquier `drizzle-kit check` estricto.

Consultas reproducibles usadas:

```sql
-- helpers presentes/ausentes
select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_organization_id','is_internal_member','user_in_current_organization',
                    'is_ops_staff','assign_stamped_rep_number','update_user_role_safe','assert_not_last_admin');

-- cuerpo vigente del helper de contexto
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='current_organization_id';

-- policies vigentes
select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename in ('profiles','user_roles') order by 1,2;

-- grants efectivos
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       g.grantee::regrole::text grantee, g.privilege_type
from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
     lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
where n.nspname='public' and p.proname like 'assign_stamped_rep_number%';
```

Grants observados hoy: `assign_stamped_rep_number(uuid,text)` → EXECUTE a `authenticated` y `service_role` (este es el bypass que 0026 cierra). `current_organization_id()` → `anon`, `authenticated`, `service_role`. `update_user_role_safe` → `authenticated`, `service_role`. `assert_not_last_admin` → solo `service_role`.

## 2. ¿0025 es aplicable tal cual?

Sí: todas sus dependencias existen (`organization_memberships` con columna `member_type text`, `user_roles`, enum `app_role`, `has_role`). No crea columnas, índices ni triggers; solo reemplaza funciones y renombra/recrea policies con `DROP POLICY IF EXISTS`, por lo que es idempotente frente al estado actual.

Efectos funcionales al aplicarla, medidos contra los datos reales (1 organización, 5 membresías / 5 usuarios distintos, 4 internas + 1 de portal, 5 perfiles, 5 filas de roles, 1 admin):

- `current_organization_id()` pasa de "la primera membresía" a "exactamente una o NULL". Hoy los 5 usuarios tienen exactamente una membresía, así que **no cambia el resultado para nadie**; 0 usuarios quedarían con NULL.
- `is_ops_staff()` exigirá membresía interna. Hay **1 cuenta de portal con rol operativo residual** (`roles_en_cuentas_portal = 1`) que dejará de pasar los filtros internos. Es el cierre buscado, pero hay que confirmar con negocio que esa cuenta no se usa hoy para operar.
- Policies de `profiles` / `user_roles` se acotan a la organización. Con una sola organización el conjunto visible no cambia; 0 perfiles y 0 roles quedan fuera de alcance.
- `update_user_role_safe` empieza a exigir admin **interno** con organización verificada; `assert_not_last_admin` cuenta admins por organización. Con **1 solo admin**, el invariante de "último administrador" sigue bloqueando su degradación o borrado (igual que hoy).
- `assert_not_last_admin` pasa a estar concedida únicamente a `service_role` (hoy ya es así).

Riesgo bajo, reversible por redefinición (las versiones previas están en el historial de `supabase/migrations`).

## 3. ¿0026 sola crea funciones rotas?

Sí crea, y no falla al aplicarse. Ambas funciones de 0026 son `plpgsql`: el validador solo revisa sintaxis, no resuelve `public.is_internal_member(...)` en tiempo de creación. Por eso:

- `CREATE OR REPLACE FUNCTION` de las dos firmas, `REVOKE`/`GRANT` y `COMMENT` se aplican sin error.
- El fallo aparece **solo en ejecución y solo por la ruta autenticada**: `drizzle/migrations/0026_…sql:82-88` evalúa `public.is_internal_member(v_uid)` cuando `auth.uid()` no es NULL → error `42883 function public.is_internal_member(uuid) does not exist`, y el pago **no** recibe folio.
- La ruta `service_role` (`v_uid IS NULL`: `stamp-payment-complement`, cron de reconciliación) **no toca** esa rama y funcionaría igual. Es decir, el daño es silencioso: CI verde, timbrado automático correcto, y falla solo cuando un admin ejecuta la asignación desde una sesión.

Conclusión: 0026 no debe considerarse lista para producción por sí sola. Dos salidas válidas: (a) aplicar 0025 antes que 0026 en la misma ventana, o (b) volver 0026 autocontenida incorporando la definición de `is_internal_member(uuid)` con sus `REVOKE`/`GRANT`. La opción (a) es la preferible porque 0025 ya está validada en CI y evita duplicar la definición del helper.

## 4. Secuencia mínima y segura de rollout (propuesta, no ejecutada)

1. Respaldo lógico previo y ventana fuera de horario de timbrado.
2. Aplicar **0024** (queda pendiente y precede en el carril), luego **0025**, luego **0026**, en una sola transacción de despliegue por el canal de migraciones de producción. No saltar 0024: dejar huecos en el carril Drizzle complica cualquier reaplicación posterior.
3. Verificación estructural inmediata:
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('is_internal_member','user_in_current_organization',
                       'current_organization_id','assign_stamped_rep_number');
   ```
   Se espera: helpers presentes, ambas firmas del asignador, `prosecdef = true`, `search_path=public` en las cuatro.
4. Verificación de grants (la parte que realmente cierra el bypass):
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) args,
          g.grantee::regrole::text, g.privilege_type
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
        lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
   where n.nspname='public' and p.proname='assign_stamped_rep_number' order by 2,3;
   ```
   Se espera: 3 parámetros → `authenticated` + `service_role`; 2 parámetros → **solo** `service_role` (sin `authenticated`).
5. Smoke en **entorno aislado** (nunca contra producción), con dos organizaciones sembradas:
   - `service_role`: asignar folio a un pago sin `rep_number` → devuelve `CP-####`; repetir con el mismo folio → mismo valor (idempotencia); mismo pago con folio distinto → `unique_violation`.
   - `authenticated` interno de la organización dueña del pago → éxito; mismo usuario contra pago de la otra organización → `42501`; usuario de portal con rol residual → `42501`; usuario sin membresía (`current_organization_id()` NULL) → `42501`.
   - Reconciliación: pago timbrado sin folio → recupera folio; segunda corrida → sin cambios.
6. Desplegar después las Edge Functions (`stamp-payment-complement`, `reconcile-stamping-invoices`).
7. Repetir el preflight de lectura en producción (pagos con `rep_number`, nulos, duplicados por organización, folios huérfanos) y compararlo con la línea base: 82 pagos, 25 con folio, 0 sin organización, 0 duplicados.

Condiciones de parada: cualquier grant inesperado en el wrapper de 2 parámetros; cualquier caso de smoke autenticado que no devuelva `42501` donde se espera; aparición de pagos con `rep_error_message` tras el despliegue; discrepancia en el preflight posterior.

Rollback conceptual (sin ejecutar): redefinir `assign_stamped_rep_number(uuid,text)` con la versión histórica y `DROP FUNCTION` de la firma de 3 parámetros; restaurar las policies y funciones previas de `profiles`/`user_roles` desde el historial de migraciones. Como todo el cambio es por redefinición de funciones y policies (sin DDL de datos, sin índices, sin columnas), no hay pérdida de información en ningún paso.

## 5. Límites y decisiones que siguen pendientes

- No se recomienda dar de alta la segunda empresa, ejecutar el Lote 2 (unicidad por organización en `feedback_reports.folio` / `payments.rep_number`) ni mover objetos de Storage hasta haber ensayado el rollout completo con **dos organizaciones en entorno aislado**.
- Catálogos sin decisión: `suppliers`, `equipment_models`, `bank_accounts`.
- Esta auditoría no ejecuta el smoke autenticado: requiere entorno aislado con dos organizaciones, que hoy no existe.
- La cuenta de portal con rol operativo residual necesita confirmación de negocio antes de aplicar 0025.
