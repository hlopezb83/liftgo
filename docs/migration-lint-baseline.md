# Baseline histórico del linter de migraciones

`scripts/lint-migrations.ts` comprueba GRANT, ENABLE RLS y CREATE POLICY en
el mismo archivo que crea cada tabla. Este análisis textual no reconstruye el
estado final de PostgreSQL. El baseline reconoce exclusivamente tres diagnósticos
históricos de esa limitación estática, revisados sobre `main`
`b76204390fe38048e629030d2bdd45cc49b4eb98`:

| Archivo en `drizzle/migrations/` | Tabla | Regla | Requisitos ausentes en ese archivo |
| --- | --- | --- | --- |
| `0016_multi_org_phase6_numbering_fiscal_scope.sql` | `organization_document_counters` | `table-requirements` | `rls`, `policy` |
| `0020_multi_org_phase7_storage_migration_ledger.sql` | `storage_object_migrations` | `table-requirements` | `grant` |
| `0020_multi_org_phase7_storage_migration_ledger.sql` | `storage_reference_migrations` | `table-requirements` | `grant` |

La identidad exige ruta completa relativa al repositorio, tabla, regla y lista
exacta de requisitos faltantes. Cada diagnóstico sigue visible como `WARN` y
anotación `::warning`; cualquier diagnóstico adicional sigue siendo error
bloqueante, incluso en esos mismos archivos. No se omite ningún archivo. Las
migraciones nuevas y las reglas existentes de SECURITY DEFINER y policies
permisivas conservan sus controles y umbral histórico originales.

## Guardia de revisión

El código fija SHA-256 del texto completo de cada archivo, incluidos comentarios,
antes de analizar SQL. Se normaliza únicamente CRLF a LF para representar el mismo
texto de Git en Windows y Linux:

- `0016`: `ae3463c6e1da9c0691fdbf26c407ab46015946f285f495992a98d14a9a0fa1a2`.
- `0020`: `4deaed042e6b5dc9cd4677f76ca35f7e7e17547dd548addaa24c951f7983b4f8`.

Si cambia un archivo incluido en el baseline, el linter emite un error de revisión
y sus hallazgos dejan de ser WARN. Esto también bloquea si el texto nuevo ya no
produce hallazgos. La huella es una guardia de revisión del baseline: **no es
evidencia de seguridad ni declara seguro todo el archivo**. No debe regenerarse
automáticamente. Cualquier cambio requiere revisar explícitamente el alcance y
las pruebas, sin ampliar la excepción a archivos completos.

## Evidencia estática y límites

- `0016` revoca PUBLIC/anon/authenticated y concede SELECT, INSERT, UPDATE a
  service_role. `0031_multi_org_audit_hardening.sql:477–484` habilita RLS y revoca
  PUBLIC/anon/authenticated para counters; sus comprobaciones `:721–724` prohíben
  expresamente policies para esa tabla. Exigir una policy en `0016` no representa
  ese diseño posterior.
- `0020:87–106` habilita RLS para ambas tablas y define policies FOR ALL TO PUBLIC
  USING(false) WITH CHECK(false), sin GRANT. No revoca PUBLIC explícitamente.
  RLS no controla TRUNCATE ni demuestra ACL heredadas o privilegios por defecto.

Esta evidencia explica el alcance de la excepción, pero no verifica permisos
efectivos, replay completo, bases existentes ni seguridad de producción. Este
ajuste no modifica SQL histórico, ACL, RLS, dependencias ni otros gates. No utiliza
el parser WIP `6013ed83` ni la allowlist `5542d646`. El PASS de
PR359/run40783741392 no acredita este SHA ni producción.

## Validación local sin SQL

```sh
node --test scripts/tests/lint-migrations.test.mjs
bun scripts/lint-migrations.ts drizzle/migrations/*.sql
bun scripts/lint-migrations.ts
```

El shell debe expandir los archivos del segundo comando (en PowerShell, pasar un
array de rutas). Las pruebas no ejecutan SQL ni requieren instalar dependencias.
El resumen informa WARN y errores; sólo los errores provocan salida 1.

Resultado local en esta base: 8/8 pruebas pasan con Node 24.22.1 y Bun 1.4.3;
Drizzle analiza 123 archivos con 3 WARN y 0 errores. Sin argumentos, Supabase
analiza 593 archivos con 0 WARN y 65 errores en Windows, salida 1: las 65
anotaciones son idénticas a las del linter original. Ese historial adicional
queda fuera de este baseline. No se ejecutó SQL, Supabase, Docker, build ni la
suite completa de la aplicación; no se instalaron dependencias.

## Revisión pendiente antes de publicar

No se ha publicado este cambio. Sobre la base indicada, `rls-db-tests.yml` se
dispara por PR a main y push a main cuando cambia `scripts/tests/**`; ejecuta
`patch_legacy_migrations.py` y `supabase start`. Un PR draft también cumple esos
triggers. `multi-tenant-ab.yml` incluye package.json/bun.lock y patrones concretos
de pruebas CI; este ajuste no cambia esos archivos. `ci.yml` selecciona el job de
lint al cambiar el linter, pero sólo analiza SQL cambiado en PR/push.

El historial `20260831203519_bb578f8c-da6a-431a-ae66-437908ec41e5.sql:14–19,43–48,66–72`
crea un secreto aleatorio si falta y programa `net.http_post` a un host productivo
fijo, con tareas cada cinco minutos y diarias. La preparación de CI y el parche
histórico no acreditan aislamiento de salida de red. No se ha ejecutado el replay
para comprobar si llega a disparar HTTP.

Antes de publicar, revalidar SHA y filtros contra el diff final. Un push a una
rama nueva y la apertura de PR tienen triggers distintos; abrir/actualizar PR a
main activaría RLS por el archivo de pruebas. Mantener esa apertura pendiente de
revisión y autorización concreta del replay y sus efectos de red. No cambiar
workflows ni usar skip-ci en este ajuste. No cerrar PR360, fusionar ni borrar
ramas como parte de esta fase local.
