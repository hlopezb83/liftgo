## Diagnóstico

El job `CI / Edge Functions (Deno smoke tests)` falla en 9s por dos causas combinadas:

1. **Env var faltante en CI**: `VITE_SUPABASE_URL` no está configurado como secret de GitHub Actions, así que en los tests `SUPABASE_URL` queda como `""` y `fetch("/functions/v1/...")` lanza `TypeError: Invalid URL`. Los 18 tests revientan al primer fetch.
2. **Glob bash sin globstar**: `supabase/functions/**/index_test.ts` en el step de CI no se expande recursivamente sin `shopt -s globstar`, por lo que `deno test` puede no recibir archivos (o recibir 0).

Los tests son smoke tests de CORS + 401 — **no necesitan secretos**: la URL pública del proyecto ya es conocida (vive en `src/integrations/supabase/client.ts` como `https://zxefrzfaynnfwazqhwxp.supabase.co`) y las respuestas 401/200 no exponen datos.

## Cambios

### 1. Helper compartido para URL base en tests
Crear `supabase/functions/_shared/test-helpers.ts` con:
```ts
export const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "https://zxefrzfaynnfwazqhwxp.supabase.co";

export const fnUrl = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;
```
Así los tests corren en CI sin depender de secretos, y siguen respetando override por env var en local.

### 2. Refactor de los 8 `index_test.ts`
Reemplazar el bloque:
```ts
const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const FN_URL = `${SUPABASE_URL}/functions/v1/<name>`;
```
por:
```ts
import { fnUrl } from "../_shared/test-helpers.ts";
const FN_URL = fnUrl("<name>");
```
(quita el `dotenv/load.ts` que en CI también ruidaba si no existe `.env`).

### 3. Fix del workflow `.github/workflows/ci.yml`
Cambiar el step `Run Deno tests` para usar `find` en vez del glob bash:
```yaml
- name: Run Deno tests
  run: |
    find supabase/functions -name 'index_test.ts' -print0 \
      | xargs -0 deno test --allow-net --allow-env --allow-read
```
Y quitar el `env: VITE_SUPABASE_URL` del job (ya no requerido; el helper tiene fallback).

### 4. Verificación
- `supabase--test_edge_functions` → 18 tests verdes localmente.
- Job CI debería pasar en el siguiente push.

### 5. Changelog
Patch `v6.13.1` — "CI: arregla job de Deno smoke tests (URL fallback + glob)".
- `public/changelog/v6.13.1.json`
- Entrada en `public/changelog.json`.

## Fuera de alcance
- No se añaden tests nuevos.
- No se tocan las Edge Functions de producción.
- No se configuran secretos en GitHub (no son necesarios para estos smoke tests).
