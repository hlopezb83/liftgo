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

### Desfase observado el 23 de septiembre de 2026

- En Lovable Cloud, el último registro leído fue `id=59`,
  `created_at=1790874179000`, correspondiente al archivo 0057. El journal de
  Git llega hasta 0061; **0058–0061 aún no constan en el ledger**.
- 0058 sólo agrega un comentario. Los efectos de 0059 (folios), 0060 (policy de
  perfiles) y 0061 (`handle_new_user`) se comprobaron directamente en la base,
  pero esa comprobación **no equivale a registrar las migraciones**.
- La herramienta de Lovable disponible para crear migraciones no aplica archivos
  existentes. Se detuvo la reconciliación sin insertar filas del ledger a mano
  ni crear una migración 0062. La próxima operación de migración en producción
  debe resolver primero este desfase por el canal oficial de Lovable y volver a
  verificar tanto el ledger como los objetos resultantes.

## Límite de certeza

Ningún documento, fecha o changelog de este repositorio certifica por sí solo
que producción esté sincronizada con `drizzle/migrations`. La única evidencia
válida es una lectura directa del ledger productivo en el momento de la
consulta.
