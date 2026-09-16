# Tramo 8.1 · Rollout del folio REP por empresa

Estado: **pendiente de CI**. La migración ya vive en el repositorio
(`drizzle/migrations/0026_rep_number_org_scoped_assignment.sql`), no está
aplicada en producción y no debe aplicarse desde este entorno.

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

## Bloqueo restante

Este entorno no puede crear commits ni lanzar GitHub Actions, así que faltan en
base limpia y con el historial completo: lint de migraciones en CI, RLS DB,
smoke SQL, Deno, Vitest, cobertura, calidad y secretos. **El tramo 8.1 no queda
aprobado** hasta que esos checks aparezcan en verde (ninguno *skipped*).
