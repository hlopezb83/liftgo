# Arreglar rls-db-tests: causa raíz encontrada

## Qué dice la evidencia del run 85585991731

El step "Start Supabase" **no falla por Docker ni por la CLI**. Los contenedores arrancan bien; lo que truena es la aplicación de migraciones desde cero:

```text
ERROR: function public.create_notification(uuid, text, text, text, text, text, uuid)
       does not exist (SQLSTATE 42883)
At statement: 10
REVOKE EXECUTE ON FUNCTION public.create_notification(...) FROM authenticated, PUBLIC
```

Es el mismo patrón de migraciones fuera de orden que ya se parcheó para tablas, pero ahora con **funciones**:

- `supabase/migrations/20260608142930_*.sql` (8 de junio) hace `REVOKE EXECUTE` sobre `public.create_notification(...)`.
- Esa función recién se crea en `supabase/migrations/20260720011916_*.sql` (20 de julio).

En la nube funciona porque la función ya existía por otro camino; desde cero, la migración de junio corre antes y falla. El mismo archivo revoca también `notify_admins(...)` y `notify_payment_received()`, que muy probablemente caen igual una vez desbloqueado el primer error.

## Fix propuesto

Extender `scripts/patch_legacy_migrations.py` (que ya se ejecuta solo en el runner, antes de `supabase start`) para cubrir la clase completa del problema, no solo esta función:

1. Añadir un paso que recorra **todas** las migraciones y envuelva cada sentencia `GRANT ... ON FUNCTION` / `REVOKE ... ON FUNCTION public.<fn>(<args>)` en un guard:

```sql
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.create_notification(uuid, text, text, text, text, text, uuid)') IS NOT NULL THEN
    EXECUTE $lgp$REVOKE EXECUTE ON FUNCTION ...$lgp$;
  END IF;
END $lgp_guard$;
```

   `to_regprocedure` devuelve NULL en lugar de lanzar error cuando la función no existe, así que la sentencia simplemente se salta en el punto del historial donde la función aún no nació, y se aplica normal en las migraciones posteriores donde sí existe.

2. Mantener intacto el mecanismo actual de tablas (`OUT_OF_ORDER` + `to_regclass`), reutilizando `split_statements()` y el mismo estilo de guard.

3. Nada de esto toca producción: las migraciones ya están registradas como aplicadas y el parche solo existe en el checkout efímero del runner.

## Qué NO se toca

`db reset`, `scripts/run_sql_suites.py`, la publicación JUnit, la versión de la CLI ni la lista `-x` del `supabase start` — la evidencia descarta que sean la causa.

## Verificación

- Correr `python3 scripts/patch_legacy_migrations.py --check` localmente para listar qué migraciones quedarían parcheadas.
- Validar el guard generado con un parseo de las sentencias afectadas (que sigan siendo SQL válido y que las firmas se extraigan bien, incluidas funciones sin argumentos).
- Éxito real = run verde en main con las 34 suites de `supabase/tests/rls/` ejecutándose. Si tras un segundo intento sigue rojo por otra migración fuera de orden, se aplica el mismo patrón al siguiente error antes de considerar el fallback a `workflow_dispatch`.

## Changelog

Entrada patch (v7.306.2) en `CHANGELOG.md`, `public/changelog.json`, `public/changelog/`, `package.json` y `public/version.json`.
