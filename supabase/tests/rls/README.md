# Pruebas SQL de RLS

Las suites de `supabase/tests/rls/` ejercitan policies contra Postgres real.
Son distintas de las pruebas RLS de Vitest que mockean al cliente y del ensayo
A/B Playwright de API, Storage y portal en `tests/multi-tenant-ab/`.

## CI

El workflow `.github/workflows/rls-db-tests.yml` usa una base local
efímera, reconstruye el esquema desde migraciones y ejecuta archivos SQL en
modo estricto. Consulta [docs/ci.md](../../../docs/ci.md) para disparadores y
[docs/migrations.md](../../../docs/migrations.md) para el orden.

## Ejecución local

Requiere Docker, Supabase CLI, Python 3 y Postgres local iniciado por Supabase.
Ejecuta desde la raíz:

```bash
supabase start
supabase db reset --no-seed
python3 scripts/run_sql_suites.py \
  --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  --dir supabase/tests/rls \
  --junit reports/rls-db-junit.xml \
  --suite-name "RLS DB" \
  --mode strict
```

Al terminar, detén la instancia local cuando ya no la necesites. Nunca
reemplaces la URL local por Lovable Cloud u otra base compartida.

## Escribir una suite

- Crea un archivo autocontenido con roles, claims y fixtures explícitos.
- Comprueba accesos permitidos y denegados para cada tenant relevante; incluye
  lecturas y escrituras cuando aplique.
- Aísla cada caso en una transacción y revierte sus datos.
- No dependas de filas, UUID o cuentas de producción.
- Nombra casos para que el reporte identifique tabla, operación y resultado.

La lista de suites y tablas cubiertas vive en los archivos SQL para evitar
mantener un inventario duplicado que se desactualiza.
