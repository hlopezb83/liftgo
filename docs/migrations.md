# Política de migraciones

Esta guía describe el flujo versionado del repositorio. No es una lectura del
ledger de Lovable Cloud ni certifica qué migraciones hay aplicadas.

## Carriles de migración

### `supabase/migrations/` — historial legado

Es el historial anterior que CI reaplica para reconstruir una base limpia.
Trátalo como forward-only: no edites, renombres, reordenes ni borres una
migración que ya haya sido compartida.

### `drizzle/migrations/` — migraciones nuevas

Las nuevas migraciones de esquema y RLS viven en `drizzle/migrations/`, junto
con `meta/_journal.json`. El journal debe tener índices continuos desde 0, una
entrada por archivo SQL, tags únicos y valores `when` enteros estrictamente
crecientes.

Valida el journal con:

```bash
bun run migrations:check
```

El verificador no modifica la base. Revisa archivos y journal; CI lo ejecuta
en el flujo de pruebas SQL.

## Qué prueba CI

El workflow
`.github/workflows/rls-db-tests.yml` crea una base efímera, reaplica el
historial legado, valida el journal de Drizzle, aplica las migraciones
versionadas y ejecuta suites SQL de RLS. Una base limpia demuestra que la
cadena del repositorio se reconstruye; no prueba que Lovable Cloud tenga el
mismo ledger.

Consulta [docs/ci.md](./ci.md) y
[supabase/tests/rls/README.md](../supabase/tests/rls/README.md) para los detalles.

## Aplicación en Lovable Cloud

1. Revisa el diff y el resultado de CI sobre
   el SHA que se propone aplicar.
2. Haz un preflight de sólo lectura del ledger del proyecto correcto y confirma
   qué migración es la última y cuáles están pendientes.
3. Revisa dependencias, objetos existentes, permisos y la verificación posterior.
4. Aplica por el canal oficial disponible para Lovable Cloud, no desde una base
   local ni mediante una sesión SQL de desarrollo.
5. Vuelve a leer el ledger y verifica los objetos y permisos esperados.
6. Registra fecha, proyecto y SHA; no incluyas claves, tokens o datos personales.

No reutilices IDs, números o timestamps de ledger observados en otra fecha como
si fueran actuales. Si el ledger no está accesible o no coincide con el orden
esperado, detén el rollout y resuelve la discrepancia antes de aplicar
migraciones posteriores.

## Límite de certeza

El contenido de
`drizzle/migrations/`, el changelog, un build exitoso o las pruebas de CI no
certifican el estado productivo. La evidencia de aplicación se obtiene
consultando el ledger del proyecto Lovable Cloud y registrando esa verificación
en el momento de la operación.
