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

- El migrador oficial ya registró 0058–0065. La última fila comprobada fue
  `id=67`, `created_at=1790874187000`: corresponde a
  `0065_customer_relation_edit_isolation.sql`, y su hash coincide con ese archivo.
- Antes de ese registro, una ejecución SQL directa expresamente autorizada
  aplicó el contenido que entonces se llamaba
  `0063_customer_relation_edit_isolation.sql`. Después Lovable reutilizó el
  número 0063 para la baja de usuarios y eliminó el archivo de aislamiento del
  repositorio. La migración 0065 reaplicó esa protección de forma idempotente y
  quedó registrada por el canal oficial. El 0063 actual registra la baja
  atómica de usuarios y su hash también coincide con su archivo.
- `0064_ledger_sync_noop_0063.sql` está registrado. El archivo
  `0066_ledger_sync_noop_0065.sql` sólo contiene `SELECT 1` y queda
  pendiente de registro: se creó para disparar la aplicación oficial de 0064 y
  0065. La próxima migración debe usar 0067 y un `when` mayor que
  1790874188000; el canal oficial registrará 0066 junto con ella.

## Límite de certeza

Ningún documento, fecha o changelog de este repositorio certifica por sí solo
que producción esté sincronizada con `drizzle/migrations`. La única evidencia
válida es una lectura directa del ledger productivo en el momento de la
consulta.
