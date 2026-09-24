# Política de migraciones

Documento vigente sobre cómo se gestionan los cambios de esquema y RLS en LiftGo.
Sustituye cualquier indicación contradictoria en otros documentos.

## Dos carriles

### `supabase/migrations/` — historial legado

- Es el historial histórico de Supabase: **forward-only e inmutable**.
- No se edita, no se renombra, no se reordena y no se borra ningún archivo.
- Sólo se usa para reconstruir la base desde cero en CI.

### `drizzle/migrations/` — carril vigente

- Fuente de verdad para **nuevas** migraciones de esquema y RLS multiempresa.
- `meta/_journal.json` debe mantener: índices continuos desde 0, tags en
  correspondencia 1:1 con los archivos `.sql`, y `when` entero y estrictamente
  creciente (drizzle-orm omite en silencio cualquier migración con `when`
  menor o igual al máximo ya aplicado).
- Verificación local y en CI: `bun run migrations:check`.

## Orden en CI

El workflow `.github/workflows/rls-db-tests.yml` ejecuta, en este orden:

1. `supabase db reset` — reaplica todo el historial legado desde cero.
2. `bun run migrations:check` — valida la coherencia del journal de Drizzle.
3. `drizzle-kit migrate` — aplica el carril vigente sobre esa base efímera.

## Producción

- Las migraciones se aplican **exclusivamente por el canal oficial de migración
  de Lovable**, nunca con `drizzle-kit migrate` ni con el editor SQL desde un
  entorno local.
- Antes de aplicar: preflight de sólo lectura sobre el ledger
  (`drizzle.__drizzle_migrations`) confirmando el último `created_at` aplicado y
  que la migración pendiente no está ya registrada.
- Después de aplicar: verificación de sólo lectura del ledger y de los objetos
  creados.
- El registro con id 31 del ledger productivo tiene origen desconocido: **no se
  borra, no se edita y no se atribuye automáticamente** a ningún archivo.

### Estado observado el 23 de septiembre de 2026

- El migrador oficial ya registró 0058–0063. La última fila comprobada fue
  `id=65`, `created_at=1790874185000`: corresponde a
  `0063_discard_internal_user_atomic.sql`, y su hash coincide con ese archivo.
- Antes de ese registro, una ejecución SQL directa expresamente autorizada
  aplicó el contenido que entonces se llamaba
  `0063_customer_relation_edit_isolation.sql`. Después Lovable reutilizó el
  número 0063 para la baja de usuarios y eliminó el archivo de aislamiento del
  repositorio. Por ello, el esquema productivo tiene la protección de clientes,
  pero el historial reproducible aún no la registra bajo su nombre final.
- `0064_ledger_sync_noop_0063.sql` y
  `0065_customer_relation_edit_isolation.sql` quedan pendientes de registro. El
  segundo reaplica de forma idempotente la protección de clientes para que una
  base reconstruida y producción lleguen al mismo estado. Deben ejecutarse por
  el migrador oficial en ese orden y verificarse en el ledger, sin insertar ni
  modificar sus filas a mano.

## Límite de certeza

Ningún documento, fecha o changelog de este repositorio certifica por sí solo
que producción esté sincronizada con `drizzle/migrations`. La única evidencia
válida es una lectura directa del ledger productivo en el momento de la
consulta.
