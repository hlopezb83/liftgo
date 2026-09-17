# Tramo 8.1 · Rollout del folio REP por empresa

Estado: **aprobado en repositorio, pendiente de producción**.

- Versión: **8.8.30**.
- Commit: `3c039b1b11a0c1134f187a182d1a18bce4f6d4cd`.
- CI principal (build/lint/Vitest/cobertura/calidad/secretos): run
  **35041914054** en verde.
- CI de RLS/smoke SQL: run **35041914094** en verde; **RLS 52/52** y
  **smoke SQL 45/45**, ninguno *skipped*.
- Producción (Supabase `zxefrzfaynnfwazqhwxp`): **sin aplicar**. La consulta de
  privilegios confirmó que sólo existe la firma
  `assign_stamped_rep_number(uuid, text)`, `SECURITY DEFINER`,
  `search_path = public`, con `EXECUTE` concedido a `authenticated` y
  `service_role`. La firma estricta de tres parámetros aún no existe en
   producción. La migración
   `drizzle/migrations/0026_rep_number_org_scoped_assignment.sql` vive en el
   repositorio y debe aplicarse por el canal de migraciones de producción; no
   debe aplicarse desde este entorno.
- **Precondición bloqueante (auditoría del 2026-09-17):** el journal
  `drizzle.__drizzle_migrations` termina en `0023`; `0024`, `0025` y `0026`
  están **pendientes**. `0026` **no debe aplicarse sola**: depende de
  `is_internal_member(uuid)`, que instala `0025` y hoy no existe en producción.
  Producción **no está lista para el rollout**. Ver la sección «Precondición de
  rollout: `0024 → 0025 → 0026`».

## Problema de rollout detectado

`supabase/functions/_shared/repFolio.ts` llama
`assign_stamped_rep_number(p_payment_id, p_folio, p_organization_id)`, pero
producción sólo tiene la firma de dos parámetros. Desplegar los Edge Functions
antes de aplicar la migración haría fallar la asignación de folio de **todos**
los complementos de pago justo después de timbrar ante el SAT. La versión
anterior del SQL propuesto además hacía `DROP` de la firma histórica, lo que
rompería cualquier caller aún desplegado.

## Rollout elegido: doble firma sin ventana de fallo

1. **Firma estricta** `assign_stamped_rep_number(uuid, text, uuid)`:
   `SECURITY DEFINER`, `search_path` fijo, autorización por rol antes de
   cualquier lectura privilegiada, organización leída de `public.payments`
   antes del `UPDATE` y condición `organization_id = v_payment_org` en el
   `UPDATE`. El parámetro de organización **sólo** sirve para rechazar cruces:
   nunca decide qué fila se actualiza.
2. **Wrapper de compatibilidad** `assign_stamped_rep_number(uuid, text)`: se
   **conserva** (no hay `DROP`) y delega en la estricta con `NULL::uuid`, sin
   argumento de organización. No actualiza `payments` por su cuenta, no acepta
   ni propaga organización del llamante y no permite sobreescribir un folio ya
   asignado (mismo folio = idempotente; folio distinto = `23505`).
3. **Respaldo en el código**: si la migración todavía no está aplicada, el
   helper detecta `PGRST202` / `42883` y reintenta con la firma histórica, en
   lugar de dejar un REP timbrado sin folio. Ese reintento no envía
   organización; la base la lee del propio pago.

Con (2) y (3) el orden de despliegue ya no puede romper los REP, pero el orden
correcto sigue siendo obligatorio:

```text
aplicar migración → verificar CI con base limpia → desplegar Edge Functions
```

## Verificación

- SQL revisable idéntico al que debe aplicarse:
  `docs/multiempresa/sql/0026_rep_number_org_scoped_assignment.sql`.
- Prueba de seguridad: `supabase/tests/rls/rep_folio_org_scope.sql`. **Falla**
  si la firma estricta no existe en el entorno donde corre; ya no usa `NOTICE`
  para volverse no-op. También verifica `SECURITY DEFINER`, `search_path`,
  lectura de la organización desde `payments`, condición de organización en el
  `UPDATE`, seguridad del wrapper y que `payments_rep_number_uidx` se conserve.
- Pruebas Deno del helper y del handler, incluidos los casos de firma faltante,
  reintento fallido, colisión, cruce de empresa e idempotencia.

## Índices

`payments_rep_number_uidx` (único global) **se conserva**. El Lote 2 de
unicidad por organización no se aplica en este tramo.

`feedback_reports_folio_key` es una **constraint `UNIQUE` global** (no un
índice suelto) que convive con `feedback_reports_organization_folio_key`
(único por organización, ya existente). Retirarla requerirá una transacción
breve de `ALTER TABLE ... DROP CONSTRAINT`, **no** `DROP INDEX CONCURRENTLY`.
El Lote 2 no se aplica hasta que exista una decisión explícita y un ensayo con
dos organizaciones en un entorno aislado.

## Reconciliación de pagos timbrados sin `rep_number`

- `reconcile-stamping-invoices/index.ts` recorre todas las organizaciones; el
  filtro por empresa sólo aplica en ejecución manual (`:200`). En ejecución
  automática (cron) no filtra, lo que es correcto porque cada pago lleva su
  propio `organization_id` y la RPC estricta lo contrasta.
- La organización se toma siempre del propio pago (`payments.organization_id`),
  nunca de un parámetro del llamante.
- `recoverRepFolio` (`:67-113`) es **idempotente**: reintentar no duplica ni
  sobreescribe folios. Ante fallo deja `rep_error_message` visible y no marca
  el pago como foleado.
- **Riesgo residual:** la reconciliación puede dejar `rep_number` pendiente por
  fallo transitorio del proveedor de timbrado o por choque contra el índice
  único global `payments_rep_number_uidx` si dos organizaciones intentan el
  mismo folio en la misma ventana. Mientras exista una sola organización esto
  no ocurre; con dos organizaciones requiere el Lote 2 cerrado.

## Preflight actual (solo lectura, sin PII)

```sql
-- payments.rep_number
SELECT count(*) AS total_payments,
       count(*) FILTER (WHERE rep_number IS NOT NULL) AS with_rep_number,
       count(*) FILTER (WHERE organization_id IS NULL) AS without_org,
       count(*) FILTER (WHERE rep_number IS NOT NULL AND organization_id IS NULL) AS orphan_folios
FROM public.payments;

-- duplicados por (organization_id, rep_number)
SELECT organization_id, rep_number, count(*) AS dup
FROM public.payments
WHERE rep_number IS NOT NULL
GROUP BY organization_id, rep_number
HAVING count(*) > 1;

-- feedback_reports.folio
SELECT count(*) AS total_reports,
       count(*) FILTER (WHERE folio IS NOT NULL) AS with_folio,
       count(*) FILTER (WHERE organization_id IS NULL) AS without_org
FROM public.feedback_reports;

-- duplicados por organización de folio
SELECT organization_id, folio, count(*) AS dup
FROM public.feedback_reports
WHERE folio IS NOT NULL
GROUP BY organization_id, folio
HAVING count(*) > 1;
```

Resultados agregados (sin PII):

| Tabla             | Filas | Con folio | Sin organización | Duplicados por organización | Folios huérfanos |
|-------------------|-------|-----------|------------------|----------------------------|-----------------|
| `payments`        | 82    | 25        | 0                | 0                          | 0               |
| `feedback_reports`| 1     | 1         | 0                | 0                          | —               |

## Ubicación de la migración y detección en CI

- Migración real y aplicable: `drizzle/migrations/0026_rep_number_org_scoped_assignment.sql`.
  Es el carril que `rls-db-tests.yml` aplica con `psql -v ON_ERROR_STOP=1`
  sobre la base efímera, después del historial de `supabase/migrations/`.
  No se agregó copia en `supabase/migrations/` porque ese directorio se aplica
  con `supabase db reset` y duplicar el SQL solo repetiría el mismo
  `CREATE OR REPLACE`.
- `rls-db-tests.yml` ya se dispara con `drizzle/**`, así que RLS y smoke SQL
  corren con esta migración incluida.
- Ajuste mínimo en `ci.yml` para que el lint de migraciones deje de aparecer
  *skipped* cuando el cambio vive solo en el carril Drizzle:
  el filtro `migrations` incluye `drizzle/migrations/**`, la resolución de
  archivos del diff también mira `drizzle/migrations/*.sql`, el job corre
  también en `workflow_dispatch` y en ese caso linta el carril completo.

## Ambigüedad de firmas (hallazgo de la validación local)

La versión inicial declaraba `p_organization_id uuid DEFAULT NULL`. Con el
wrapper de dos parámetros presente, PostgreSQL rechaza toda llamada de dos
argumentos con `42725 function ... is not unique`. La migración final declara el
tercer parámetro **sin** valor por omisión; el wrapper pasa `NULL::uuid`
explícito.

## Validación local ejecutada (base PostgreSQL 17 limpia, efímera)

Se levantó un PostgreSQL local desechable con un fixture mínimo (`auth.uid`,
`app_role`, `has_role`, `payments`, `payments_rep_number_uidx` y la función
histórica de dos parámetros tal como está en producción), se aplicó la
migración y se comprobaron diez casos: flujo válido con la organización del
pago, idempotencia con el mismo folio, rechazo de sobreescritura con folio
distinto, rechazo de cruce de organización sin escribir la fila, rechazo de
pago sin organización, choque contra el índice global, folio ausente, wrapper
de dos parámetros funcionando sin alterar la organización, pago inexistente y
usuario sin rol. Todos pasaron.

Además, `supabase/tests/rls/rep_folio_org_scope.sql` se ejecutó dos veces:
pasa con la migración aplicada y **falla** (`exit 3`) contra una base sin ella.

## Aislamiento del llamante (hallazgo posterior, corregido)

El rol no basta. La versión anterior de la migración solo exigía
`has_role(admin/administrativo)`, así que un admin autenticado de la
organización A podía invocar la RPC directamente sobre un pago de B (incluso
pasando `NULL` como `p_organization_id`) porque es `SECURITY DEFINER`. La
validación del helper de Edge Functions no protege una RPC concedida a
`authenticated`.

Corrección aplicada en la migración:

- Tras leer `organization_id` del pago y antes del `UPDATE`, todo llamador con
  `auth.uid()` no nulo debe cumplir
  `current_organization_id() = organization_id del pago` **y**
  `is_internal_member(auth.uid())`. Si no, se rechaza con `42501` sin escribir.
- `p_organization_id` sigue siendo solo un contraste adicional: nunca decide.
- El canal interno (`service_role` / cron) no tiene `auth.uid()` y sigue
  operando; su límite es el `GRANT`.
- **Decisión sobre el wrapper de dos parámetros:** se conserva para los
  callers de servicio ya desplegados, pero se le **revoca `EXECUTE` a
  `authenticated`** (queda solo `service_role`). Se revisaron todos los
  callers del repositorio: únicamente lo invoca el canal interno con service
  client; no existe ningún caller de navegador. Así el wrapper no puede usarse
  como puerta trasera para delegar con `NULL`.
- Se conservan idempotencia, rechazo de sobreescritura con folio distinto,
  `SECURITY DEFINER` con `search_path` fijo y el índice global
  `payments_rep_number_uidx`.

La prueba `supabase/tests/rls/rep_folio_org_scope.sql` agrega una verificación
conductual A/B: un admin de A intenta folear un pago de B con la organización
de B, con `NULL` y por el wrapper histórico; los tres deben fallar y el pago de
B no debe cambiar, mientras el flujo válido de A devuelve `CP-0007` de forma
idempotente. Se comprobó localmente que esta prueba **falla** contra la versión
sin el chequeo de contexto y **pasa** con la versión corregida.

## Precondición de rollout: `0024 → 0025 → 0026` (auditoría directa de producción, solo lectura)

Auditoría de introspección ejecutada contra producción (`zxefrzfaynnfwazqhwxp`)
**sin ningún cambio**: solo `SELECT` sobre catálogos del sistema. No se aplicó
DDL, no se escribió en Supabase, no se creó una segunda organización y no se
movió Storage.

### Estado real del journal

`drizzle.__drizzle_migrations` **termina en `0023`**. Por lo tanto **`0024`,
`0025` y `0026` están pendientes en producción**.

```sql
SELECT id, hash, to_timestamp(created_at / 1000) AS applied_at
FROM drizzle.__drizzle_migrations
ORDER BY id;
```

Última entrada: hash `9ee7719a…` (= `0023_payment_intent_invoice_definer_check.sql`),
aplicada el 2026-09-15 17:52:34Z.

`public.get_customer_id_for_user(uuid)` **existe, pero con su definición
anterior**: su presencia **no prueba** que `0024` esté aplicada. La verificación
válida es el journal, no la existencia del nombre de la función.

### `0025` no está en producción

Faltan `public.is_internal_member(uuid)` y
`public.user_in_current_organization(uuid)`. `public.current_organization_id()`
conserva el cuerpo anterior (`LIMIT 1`). Siguen vigentes las policies globales
antiguas, sin sus reemplazos por organización:

- `profiles`: «Staff can view all profiles», «Auditor read profiles»,
  «Ventas read profiles», «Admins update any profile»,
  «Administrativo update any profile».
- `user_roles`: «Admins can manage all roles» (`ALL`),
  «Only admins can modify roles», «Only admins can update roles»,
  «Only admins can delete roles», «Auditor read user_roles».

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_organization_id','is_internal_member',
                    'user_in_current_organization','is_ops_staff',
                    'assign_stamped_rep_number');

SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'current_organization_id';

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('profiles','user_roles')
ORDER BY 1, 2;
```

### `0025` no es «solo instalar un helper»

Las dependencias estructurales observadas existen
(`organization_memberships.member_type`, `user_roles`, enum `app_role`,
`has_role`), pero `0025` **reemplaza funciones y policies y acota RLS**:
redefine `current_organization_id()`, `is_ops_staff()`,
`update_user_role_safe()` y `assert_not_last_admin()`, y sustituye las policies
globales de `profiles` y `user_roles` por versiones acotadas por organización.

Estado de membresías observado: **5 miembros (4 internos y 1 de portal)** y
**una cuenta de portal conserva un rol operativo residual**. Con
`is_ops_staff()` acotado por `0025`, esa cuenta **dejaría de contar como
personal interno**. Esto es una **validación funcional previa obligatoria** con
el área de negocio; **no** debe asumirse como impacto inocuo.

```sql
SELECT (SELECT count(*) FROM public.organization_memberships)                     AS membresias,
       (SELECT count(*) FROM public.organization_memberships
         WHERE member_type = 'internal')                                          AS internos,
       (SELECT count(*) FROM public.user_roles ur
          JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
         WHERE m.member_type <> 'internal')                                       AS roles_en_cuentas_portal;
```

### Por qué `0026` sola no basta (y por qué CI no lo acredita)

Ambas funciones de `0026` son `plpgsql`: PostgreSQL resuelve
`public.is_internal_member(...)` **al ejecutar**, no al crear. Consecuencias:

- `0026` se aplica sin error aunque falte el helper.
- Una llamada **autenticada** falla en runtime con
  `42883 function public.is_internal_member(uuid) does not exist`
  (`drizzle/migrations/0026_rep_number_org_scoped_assignment.sql:82-88`) y el
  pago **no** recibe folio.
- La rama **`service_role`** (`auth.uid()` nulo) **no toca** ese helper y
  seguiría operando con normalidad.

Por eso la **CI verde no acredita por sí sola** que el estado de producción sea
seguro: CI corre sobre base limpia con todo el carril aplicado, mientras que
producción está en `0023`.

### Secuencia propuesta (no ejecutada)

1. Resolver/verificar `0024`.
2. Aplicar `0025`, revisando previamente las policies que reemplaza y el efecto
   sobre la cuenta de portal con rol operativo residual.
3. Aplicar `0026`.
4. Verificar `search_path` y grants: wrapper REP de dos argumentos **solo**
   `service_role`; firma de tres argumentos para `authenticated` y
   `service_role`.
5. Probar **ambos canales** (autenticado interno y `service_role`) en una base
   **aislada con dos organizaciones**.
6. Desplegar las Edge Functions **solo después** de ese ensayo.
7. **No** habilitar una segunda empresa operativa hasta cerrar también las
   pruebas A/B completas.

Grants observados hoy en producción (línea base):
`assign_stamped_rep_number(uuid, text)` con `EXECUTE` para `authenticated` y
`service_role`; `current_organization_id()` para `anon`, `authenticated` y
`service_role`; `update_user_role_safe` para `authenticated` y `service_role`;
`assert_not_last_admin` solo `service_role`.

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       g.grantee::regrole::text AS grantee, g.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
     LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
WHERE n.nspname = 'public' AND p.proname = 'assign_stamped_rep_number'
ORDER BY 2, 3;
```

### Discrepancias de hash en el journal

Cuatro migraciones antiguas tienen hash distinto entre el journal y el archivo
actual del repositorio: **`0004`, `0005`, `0006` y `0010`** (ids 5, 6, 7 y 10).
El migrador de Drizzle avanza por marca de tiempo según la revisión, así que no
las reaplica; **pero estas discrepancias deben reconciliarse y entenderse antes
de depender de una verificación estricta del journal** (por ejemplo, un
`drizzle-kit check` bloqueante o cualquier control que compare hashes).

Reproducible: comparar `sha256sum drizzle/migrations/*.sql` contra la columna
`hash` del journal.

### Conclusión y límites

**No hubo ningún cambio en producción**: la auditoría fue exclusivamente de
lectura. La lectura directa **no sustituye** un ensayo con dos organizaciones en
un entorno aislado. Mientras ese ensayo no exista, **producción no está lista
para el rollout** y **`0026` no debe aplicarse sola**. El Lote 2, el traslado de
Storage histórico y el alta de la segunda empresa siguen **pendientes**.

## Runbook de aplicación en producción

> No ejecutar nada de esto desde este entorno. El runbook es el procedimiento
> autorizado para cuando se decida aplicar la migración en producción.

Orden seguro (no alterar):

1. **Preflight de solo lectura** (repetir las consultas de arriba) y registrar
   los conteos. Condiciones de parada: cualquier fila sin organización, cualquier
   duplicado por `(organization_id, rep_number)` o cualquier folio huérfano
   detiene el rollout.
2. **Resolver primero la cadena `0024 → 0025 → 0026`** (ver la sección
   «Precondición de rollout»). `0026` **no debe aplicarse sola**: se crearía sin
   error y fallaría en runtime con `42883` en la ruta autenticada. Aplicar por
   el canal de migraciones de producción (el mismo que usa CI:
   `psql -v ON_ERROR_STOP=1` contra la base productiva), en ese orden y en la
   misma ventana. En `0025`, revisar antes las policies que reemplaza y el
   efecto sobre la cuenta de portal con rol operativo residual. No aplicar
   `DROP` de la firma histórica; la migración usa `CREATE OR REPLACE` y
   conserva el wrapper.
3. **Verificar ambas firmas** en producción:
   ```sql
   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
          p.prosecdef AS security_definer, p.proconfig AS proconfig
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'assign_stamped_rep_number';
   ```
   Confirmar: firma `(uuid, text, uuid)` y `(uuid, text)` presentes;
   `security_definer = true`; `proconfig` incluye `search_path=public`;
   `EXECUTE` de la firma estricta a `authenticated` y `service_role`;
   `EXECUTE` del wrapper **solo** a `service_role` (revocado a
   `authenticated`).
4. **Desplegar las Edge Functions** (`stamp-payment-complement` y
   `reconcile-stamping-invoices`) **después** de la migración, no antes.
5. **Smoke de asignación/reconciliación en entorno aislado** (no producción):
   timbrar un complemento de pago y verificar que el folio quede asignado;
   forzar un fallo transitorio y verificar que `recoverRepFolio` lo recupera sin
   duplicar ni sobreescribir.
6. **Repetir el preflight** en producción: conteos sin cambios, cero
   duplicados, cero huérfanos.
7. **No dar de alta la segunda empresa** ni ejecutar el Lote 2 hasta que el
   bypass esté cerrado (wrapper sin `EXECUTE` a `authenticated`) y se haya
   ensayado el flujo completo con dos organizaciones en un entorno aislado.

### Rollback conceptual (sin aplicar)

- Si la migración falla al aplicarse: el canal de migraciones debe revertir el
  `CREATE OR REPLACE` restaurando la firma histórica de dos parámetros tal
  como está hoy en producción. Las Edge Functions aún no se desplegaron, así
  que no hay callers de la firma estricta.
- Si la migración aplicó pero las Edge Functions aún no se desplegaron: el
  wrapper de dos parámetros sigue funcionando con `service_role`; los callers
  internos no se rompen. Revertir la migración restaura el estado anterior sin
  pérdida de datos (no hubo `DROP` ni cambio de columnas).
- Si las Edge Functions ya se desplegaron y fallan: el helper reintenta con la
  firma histórica (`repFolio.ts:124`), así que los REP no quedan sin folio. Para
  revertir, desplegar la versión anterior de las Edge Functions y luego
  revertir la migración.
- El índice `payments_rep_number_uidx` se conserva en todos los casos; no hay
  acción de rollback sobre índices en este tramo.

## Decisiones de catálogo pendientes

Aún no resueltas (no bloquean el tramo 8.1, pero sí el alta de la segunda
empresa):

- **`suppliers`**: unicidad de RFC por organización vs. global.
- **`equipment_models`**: unicidad de modelo/SKU por organización.
- **`bank_accounts`**: unicidad de cuenta/clabe por organización.
- **Ventana de alta de la segunda empresa**: no se inicia hasta cerrar el
  bypass del folio REP, ensayar con dos organizaciones en entorno aislado y
  decidir el Lote 2 de unicidad por organización.
