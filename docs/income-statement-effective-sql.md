# SQL efectivo de Estado de Resultados: evidencia de CI

## Propósito y fuente de autoridad

Las migraciones siguen siendo la única fuente editable del esquema. Este
reporte facilita revisar el resultado de la cadena, en particular las
transformaciones de cuerpos y fingerprints de `0117`, `0118` y `0119`. No es
una migración, un nuevo origen SQL ni un mecanismo de despliegue.

El workflow `RLS DB tests` ya reconstruye una base efímera desde el historial
Supabase y el replay Drizzle. Inmediatamente después de verificar ese replay,
antes de las suites que crean fixtures, ejecuta
`scripts/ci-drizzle-function-report.mjs`. No se añade un segundo replay.

La implementación y sus pruebas offline no afirman que se haya ejecutado SQL.
La generación real del artefacto y las regresiones PostgreSQL requieren que el
workflow autorizado posterior complete el replay y este paso para el mismo SHA.

## Alcance cerrado

Sólo se resuelven estas firmas exactas por `to_regprocedure`, una consulta
parametrizada por firma:

- `public.get_income_statement(date,date,text)`
- `public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)`

El script exige `GITHUB_ACTIONS=true`, el guard `CI=true`/endpoint loopback fijo
del replay existente y la validación byte a byte de su copia/manifiesto antes
de cargar el driver. No acepta argumentos, nombres adicionales ni endpoints
alternativos. Usa una transacción `REPEATABLE READ READ ONLY` y una conexión
con `default_transaction_read_only=on`.

Sólo consulta metadatos de esas funciones en `pg_proc`, incluyendo ACL
normalizada mediante `aclexplode`. Nunca invoca las RPC, lee tablas de negocio,
vuelca todo el catálogo, consulta secrets ni aplica SQL del artefacto. El ledger
lo verifica el paso anterior existente; el colector no lo vuelve a consultar.
No modifica funciones, permisos, políticas, roles, datos ni migraciones.

## Artefacto y formato

Dentro de `rls-db-reports` (retención existente de 14 días):

`income-statement-effective-functions.json`

Formato `formatVersion: 1`, con:

- SHA de checkout de GitHub Actions. En PRs puede ser el merge commit de prueba,
  no el head de la rama.
- SHA-256 del manifiesto de replay serializado, para compararlo con
  `ci-drizzle-replay-manifest.json` del mismo artefacto.
- Por firma: texto exacto de `pg_get_functiondef`, SHA-256 de sus bytes UTF-8,
  MD5 de `prosrc`, propietario, volatilidad, `INVOKER`, `search_path` y ACL.
- Mapa de referencias función → archivos de migración, con líneas (base 1) y
  SHA-256 de los bytes de cada archivo consultado.

`sourceMd5` coincide con el algoritmo de los guards históricos. No es una
prueba criptográfica de autenticidad. `definitionSha256` permite comparar
la definición completa sin normalizar espacios. PostgreSQL puede cambiar el
formato de `pg_get_functiondef` entre versiones; comparar versiones distintas
requiere revisar la definición, no asumir drift semántico por un hash distinto.
`pg_get_functiondef` puede omitir la cláusula predeterminada `SECURITY INVOKER`;
el campo `security` se obtiene de `prosecdef`, no de buscar esa cláusula.

La ACL incluye grantor, grantee, privilegio y grant option. Si `proacl` es NULL,
se expande `acldefault('f', owner)` y se marca `aclSource: default`, en lugar de
ocultar el EXECUTE de PUBLIC. Es la ACL directa efectiva del objeto, no una
enumeración de acceso transitivo por membresía, superusuario, RLS o permisos de
tablas. No se filtran grants inesperados: deben ser visibles para el revisor.

El artefacto falla cerrado si falta una firma, definición, hash o ACL, si deja
de ser INVOKER, si su configuración no es exactamente `search_path=public`,
o si el fingerprint del detalle no coincide con `sourceMd5` de la canónica.
No se serializan GUCs personalizados ni errores del driver. El archivo sólo
se escribe después de validar ambas funciones y el mapa, sin sustituir un
archivo preexistente. Un paso fallido no certifica el reporte.

## Mapa de la cadena relevante

El mapa completo se genera desde los nombres concretos en los archivos de los
dos carriles, en orden de archivo dentro de cada carril (Supabase primero).
Son referencias textuales: pueden ser creación, ALTER, lectura, guard,
transformación o comentario. No equivalen a un parser SQL ni prueban por sí
solas que una migración altere o se haya aplicado a una función. Un nombre
construido dinámicamente sin el token completo requerirá revisión manual.

Puntos relevantes de la cadena actual:

- `supabase/migrations/20260831184510_1b4d05fe-419b-47ad-b28e-81791f3b6497.sql`:
  definición completa canónica de Resultados; el mapa conserva también las
  referencias anteriores y posteriores, no sólo este punto de partida.
- `drizzle/migrations/0036_multi_org_analytics_rpc_invoker_scope.sql`:
  cambia la canónica a INVOKER sin cambiar su ACL ni cuerpo.
- `drizzle/migrations/0117_income_statement_documents.sql`:
  lee la canónica, deriva el detalle, inserta su fingerprint y configura la ACL
  del nuevo RPC de detalle. La mención de la canónica es una dependencia, no
  una redefinición de esa función.
- `drizzle/migrations/0118_income_statement_calculation_corrections.sql`:
  modifica ambos cuerpos bajo guards y actualiza el fingerprint del detalle.
- `drizzle/migrations/0119_income_statement_fx_validity.sql`:
  modifica ambos cuerpos para reglas FX y vuelve a actualizar el fingerprint.

Los hashes del mapa son los bytes del checkout del runner. Si el paso existente
`patch_legacy_migrations.py` adapta una migración histórica, el hash de ese
archivo representa la copia que CI leyó, no necesariamente el blob canónico
de Git. El manifiesto Drizzle mantiene sus verificaciones byte a byte existentes.

## Método de revisión y verificación

1. Exigir replay Supabase/Drizzle y generación del reporte exitosos en el mismo
   run/SHA. Consultar las exclusiones explícitas del manifiesto existente; el
   reporte no las modifica ni convierte recibos omitidos en migraciones aplicadas.
2. Descargar `rls-db-reports` y comparar ambas definiciones, hashes, ACL,
   propietario, volatilidad e INVOKER/search_path con el run base revisado.
3. Revisar juntos el total y el detalle. El fingerprint debe cambiar de forma
   coordinada, no eliminarse para hacer pasar el gate. No copiar el JSON como
   una segunda definición editable ni ejecutar su contenido.
4. Exigir también las suites PostgreSQL existentes de documentos/ACL y
   cálculo/detalle: cash/accrual, NC, divisas y drift de fuente. Un reporte de
   catálogo correcto no demuestra igualdad de importes ni aislamiento RLS.
5. Para nuevos cambios preferir migraciones forward-only con definiciones
   completas revisables, o generación determinista desde un origen compartido.
   No reordenar ni reescribir la historia existente.

Pruebas offline del formato, allowlist, hashes, configuración, ACL, mapa,
fingerprint, fallos cerrados y orden del workflow (sin driver ni base):

```sh
node --test scripts/tests/ci-drizzle-function-report.test.mjs
```

También se incluyen automáticamente en `bun run test:ci-tools` por el glob
existente. Ninguna de estas pruebas offline sustituye el replay real.

Este reporte nunca certifica el ledger ni el estado productivo de Lovable
Cloud. La comprobación del entorno desplegado sigue el proceso separado de
[migraciones](./migrations.md).
