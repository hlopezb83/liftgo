# Tramo 8.1 · Rollout del folio REP por empresa

> **Nota de estado (2026-09-18, auditoría del tramo 11).** Todo lo que sigue
> es el registro **histórico** del 2026-09-17 *antes* del rollout. Quedó
> superado: `0024 → 0029` ya se aplicaron en producción el 2026-09-17 por el
> canal oficial de migraciones (ledger con ids 25–30 = archivos actuales
> `0024`–`0029`, hashes idénticos). En el ledger hay además un id 31 **extra no
> identificado** (`created_at=1789683904941`, hash `927e6c30…`) que no coincide
> con ningún archivo actual; no se atribuye a `0024` ni a `0030`, no se borra y
> no acredita que `0030` esté aplicada. `0030` **sí existe en HEAD** (SQL,
> snapshot y journal idx 30) y sigue **pendiente en producción**, igual que
> `0031 → 0034`. El estado vigente del rollout se lleva en `roadmap.md`; las
> frases de abajo que dicen «journal en `0023`» o «`0025`/`0026` pendientes»
> describen el estado previo, no el actual.

Estado: **histórico — superado por el rollout del 2026-09-17** (en su momento:
aprobado en repositorio, pendiente de producción).

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

### Discrepancias de hash en el journal (resultado final de la auditoría, 2026-09-17)

Auditoría de solo lectura completada; **corrige el registro previo** (versión
8.8.33), que reportaba cuatro diferencias con un error. El resultado final es:

- **Cinco diferencias históricas**, en los ids Drizzle **5, 6, 7, 8 y 11**, que
  corresponden a las migraciones **`0004`, `0005`, `0006`, `0007` y `0010`**:

  | id | Migración | Hash guardado (journal) | Hash actual (archivo) | Aplicada (UTC) |
  |----|-----------|-------------------------|-----------------------|----------------|
  | 5  | `0004_multi_org_phase3_write_context_guard` | `5fcdaa37…a1fe` | `ffc22130…dd62` | 2026-09-13 23:30 |
  | 6  | `0005_multi_org_phase4_read_isolation` | `50d1d882…7222` | `877a67d7…e128` | 2026-09-14 00:00 |
  | 7  | `0006_multi_org_phase4_portal_scope` | `f5fff091…9649` | `a65e787c…5ae5` | 2026-09-14 00:10 |
  | 8  | `0007_multi_org_phase4_customer_rpc_scope` | `5eb32b05…2780` | `c296a4f7…63e8` | 2026-09-14 00:20 |
  | 11 | `0010_multi_org_phase5_bank_write_rpc_scope` | `946fd138…bac1` | `b0804f85…686e` | 2026-09-14 00:50 |

  La correspondencia es **id N = archivo 000(N-1)**.
- **El id 10 (`0009_multi_org_phase5_bank_read_rpc_scope`) sí coincide**
  (`1ab4511a…381b` en journal y archivo): fue una **falsa alarma** del reporte
  previo, causada por el desfase id↔nombre.
- **El resto de las filas, hasta el id 24 (`0023`), coincide exactamente.**

Reproducible: `sha256sum drizzle/migrations/*.sql` contra la columna `hash`
de `drizzle.__drizzle_migrations`. Los valores completos de 32 bytes se
verificaron por recálculo directo el 2026-09-17 antes de escribir este
documento; no se inventó ningún checksum.

#### Alcance de la evidencia

- **Cómo decide el migrador (hecho, con código):** Drizzle ORM **0.45.2**
  calcula `sha256` del archivo completo (`drizzle-orm/migrator.js`) pero el
  dialecto PostgreSQL (`drizzle-orm/pg-core/dialect.js`, líneas 56-69) lee una
  sola fila con `order by created_at desc limit 1` y aplica cada migración sólo
  si `created_at < when` del journal: **avanza por marca de tiempo y nunca
  compara la huella**. Una huella distinta no provoca error ni reaplicación.
  Además, el repositorio **no invoca el migrador por su cuenta** y la CI aplica
  los `.sql` por orden de nombre con `psql` sobre base limpia.
- **Historial Git (hecho):** cada uno de los cinco archivos aparece en un solo
  commit, **posterior** a su hora de aplicación (`0004` → `410061a8f`,
  2026-09-14 00:34 UTC; `0005`, `0006`, `0007` → `cce90c81d`, 01:18 UTC;
  `0010` → `f68b5237e`, 02:56 UTC), sin ediciones posteriores. Inferencia: se
  aplicaron desde la copia de trabajo y se pulieron antes de subir; la huella
  guardada corresponde a un borrador que nunca quedó en Git.
- **Comparación funcional con producción (hecho):** las **13 funciones** que
  crean `0004`–`0007` tienen en producción el **mismo md5 de cuerpo** que el
  texto de los archivos actuales; `0010` tiene sus cuatro RPC de conciliación
  en **`SECURITY INVOKER`**, como pide el archivo; existen las **55 policies
  `org_scope_isolation`**, los **57 triggers** de guardia de escritura y el
  trigger de clientes.
- **Conclusión limitada a los objetos comprobados:** **no se detectó
  divergencia funcional**; las diferencias parecen de texto (comentarios o
  bloques de verificación de los borradores aplicados). **No se puede comparar
  cada línea** del borrador perdido, que ya no existe.

#### Recomendación (forward-only)

**No reescribir hashes ni archivos históricos, no tocar el journal:** dejar el
registro tal como está. Reescribirlo no aporta nada y arriesga romper el avance
por marca de tiempo. Si en el futuro se quiere verificación estricta de
huellas, debe ser **aditiva y propia**: una migración nueva que registre las
huellas esperadas en una tabla de auditoría, más un chequeo en CI; nunca una
corrección retroactiva. Esta sección queda como la explicación oficial para que
una futura verificación estricta no interprete las cinco diferencias como
manipulación.

### Conclusión y límites

**No hubo ningún cambio en producción**: la auditoría fue exclusivamente de
lectura. El **ensayo aislado de `0024 → 0025 → 0026` ya pasó en CI desde base
limpia** (RLS **53/53**, smoke SQL **45/45**, con la prueba de cadena
`migration_chain_0024_0026.sql`), así que ese ensayo **ya no está pendiente**.
Sí sigue pendiente el **rollout productivo**: el journal llega a `0023`, faltan
esas tres migraciones y, antes de proponerlo, debe resolverse el efecto de
negocio del **rol operativo residual de la cuenta portal** y revisarse
**grants/`search_path`**. El ensayo de **Storage histórico con dos
organizaciones** y el **alta de la segunda empresa** siguen **pendientes**, así
como el Lote 2 de unicidad.

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

## Actualización 8.10.4 — endurecimiento de las pruebas del asignador (solo CI)

Auditoría del repo en el commit `61df74ee2052a92c67d7e7bd08d9544871ba5b7a`:
las dos suites que vigilan el folio REP aceptaban configuraciones más débiles
que el contrato real de la migración 0026.

| Brecha detectada | Dónde estaba | Cómo quedó |
| --- | --- | --- |
| El wrapper de dos parámetros era opcional (`IF v_legacy IS NOT NULL`) | `migration_chain_0024_0026.sql` §2 y `rep_folio_org_scope.sql` §2 | Ambas suites exigen las **dos** firmas; su ausencia es fallo |
| `search_path` validado con `v_def !~ 'search_path'` (solo texto) | `rep_folio_org_scope.sql:35,83` | Se valida `proconfig` y se exige `search_path=public` exacto |
| Sin verificación de `SECURITY DEFINER`/`search_path` en los helpers de 0025 | ninguna suite | Nueva sección 1.b en `migration_chain_0024_0026.sql` |
| Sin verificación de `anon`/`PUBLIC` en los grants | ambas suites | `has_function_privilege('anon', ...)` + `aclexplode(proacl)` con `grantee = 0` |

Contrato exigido ahora por CI (coincide con `0026_rep_number_org_scoped_assignment.sql:127-162`
y `0025_multi_org_phase8_admin_membership_scope.sql:24-98`):

- `assign_stamped_rep_number(uuid, text, uuid)` — `SECURITY DEFINER`,
  `search_path=public`, `EXECUTE` para `authenticated` y `service_role`,
  sin `EXECUTE` para `anon` ni `PUBLIC`.
- `assign_stamped_rep_number(uuid, text)` — obligatoria, `SECURITY DEFINER`,
  `search_path=public`, `EXECUTE` **solo** para `service_role`.
- `current_organization_id()`, `is_internal_member(uuid)`,
  `user_in_current_organization(uuid)`, `is_ops_staff()` — `SECURITY DEFINER`
  con `search_path=public`.

Se conservan intactas todas las aserciones previas: escenario A/B con dos
organizaciones sintéticas, usuario sin membresía (fail-closed), cuenta de
portal con rol operativo residual (sin decidir su tratamiento: la prueba solo
documenta que no pasa como personal interno), ausencia de `is_internal_member`
al aplicar 0026 sin 0025 (SQLSTATE 42883 dentro de un `SAVEPOINT`), SQLSTATE
42501 exacto en los cruces y no mutación del pago de la otra empresa.

Validación local: los 12 bloques `DO` de `migration_chain_0024_0026.sql` y los
4 de `rep_folio_org_scope.sql` compilan en PostgreSQL 17.9 temporal y aislado.
La corrida completa (RLS + smoke) se ejecuta en GitHub Actions. No se conectó
ni se escribió nada en la base de producción.

## Actualización 8.10.5 — `anon` con EXECUTE en la firma estricta (CI run 35232675033)

La corrida de GitHub Actions
[35232675033](https://github.com/hlopezb83/liftgo/actions/runs/35232675033)
dejó RLS en 52/54: `migration_chain_0024_0026.sql` y `rep_folio_org_scope.sql`
fallaron exactamente en `has_function_privilege('anon', v_strict, 'EXECUTE')`.
Smoke 45/45, CI principal y Gitleaks en verde.

**Causa (confirmada, no falso positivo).** Supabase ejecuta
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,
authenticated, service_role`. Toda función **nueva** del esquema `public` nace
con `EXECUTE` concedido **directamente** a `anon` en su `proacl`. El permiso no
es heredado por membresía de roles ni proviene de `PUBLIC`, por lo que
`REVOKE ALL ... FROM PUBLIC` no lo elimina y la función sí era invocable por
`anon`. El wrapper de dos parámetros no fallaba porque se crea con
`CREATE OR REPLACE` sobre una función preexistente, y `REPLACE` conserva el ACL
anterior (los privilegios por defecto no se reaplican).

Reproducción en PostgreSQL 17.9 temporal y aislado:

```sql
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create function public.f(a int) returns int language sql as 'select 1';
revoke all on function public.f(int) from public;
grant execute on function public.f(int) to authenticated, service_role;
select has_function_privilege('anon','public.f(int)','EXECUTE');  -- t
select grantee::regrole, privilege_type from aclexplode((select proacl from pg_proc where proname='f'));
-- anon:EXECUTE (grant DIRECTO)
revoke all on function public.f(int) from anon;
select has_function_privilege('anon','public.f(int)','EXECUTE');  -- f
```

**Corrección mínima** (migración pendiente, aún no aplicada):
`0026_rep_number_org_scoped_assignment.sql` añade
`REVOKE ALL ON FUNCTION ... FROM anon` a la firma estricta `(uuid, text, uuid)`
y al wrapper `(uuid, text)`. Se conservan `EXECUTE` para `authenticated` y
`service_role` en la estricta y solo `service_role` en el wrapper.

**Endurecimiento de pruebas.** Ambas suites verifican ahora la **ACL directa**
con `aclexplode(proacl)`, no solo el privilegio efectivo: sin fila `anon` en
ninguna firma; filas obligatorias `authenticated` y `service_role` en la
estricta; `service_role` obligatoria y `authenticated` prohibida en el wrapper.

**Validación local** (PostgreSQL 17.9 temporal, sin red, sin producción): con
los privilegios por defecto de Supabase reproducidos, se aplicó 0026 corregida
y los bloques de contrato de ambas suites pasan
(`CADENA 0026: firmas, SECURITY DEFINER, search_path y grants OK`,
`REP FOLIO ORG: contrato estático OK`). Mutación de control: al volver a
conceder `EXECUTE` a `anon`, la suite falla con
`CADENA 0026: la firma estricta NO debe ser ejecutable por anon`. La corrida
completa RLS + smoke se ejecuta en GitHub Actions.

## Actualización 8.10.6 — validación de código cerrada en CI (commit `0a941a4a`)

La corrida de GitHub Actions sobre el commit correctivo
`0a941a4adbf1ca4e3ce44eb5fae7cb35513bd86f` (versión 8.10.5) confirmó que
todas las suites pasan:

| Suite | Run | Resultado | Enlace |
| --- | --- | --- | --- |
| RLS DB tests | 35234484524 | 54/54, 0 fallidas | https://github.com/hlopezb83/liftgo/actions/runs/35234484524 |
| SQL smoke (mismo run) | 35234484524 | 45/45, 0 fallidos | https://github.com/hlopezb83/liftgo/actions/runs/35234484524 |
| CI principal | 35234484453 | éxito (Vitest shards/merge-cobertura, Calidad lint/tipos/build/arranque, lint de migraciones) | https://github.com/hlopezb83/liftgo/actions/runs/35234484453 |
| Gitleaks | 35234484442 | éxito | https://github.com/hlopezb83/liftgo/actions/runs/35234484442 |

**Estado de la validación de código: cerrada.** Las dos suites que habían
fallado en 8.10.5 (`migration_chain_0024_0026.sql` y `rep_folio_org_scope.sql`,
ambas en `has_function_privilege('anon', v_strict, 'EXECUTE')`) ahora pasan
con la corrección de ACL aplicada en el commit `0a941a4a`.

Quedó una advertencia no bloqueante de orden de imports, preexistente en
`src/hooks/useDocuments.ts` y fuera del diff de este tramo; no afecta la
validación.

**La migración sigue pendiente de rollout productivo.** El journal de
producción sigue en `0023`; `0024`, `0025` y `0026` no se aplicaron. No se
ejecutó SQL contra la base productiva, no se activó una segunda empresa y no
se movieron objetos de Storage. El runbook de aplicación (sección «Runbook
de aplicación en producción») sigue siendo el procedimiento autorizado para
cuando se decida el rollout.
