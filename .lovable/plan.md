

## Agregar campo de API Key de Facturapi en Company Settings

### Contexto actual

- La sección PAC ya existe en `CompanySettingsPage.tsx` con el toggle test/live, pero el toggle **no se persiste** al guardar (no está incluido en el `handleSubmit`).
- El API key actualmente se espera como secret del backend (`FACTURAPI_API_KEY`), pero no existe aún.
- La edge function `stamp-cfdi` ya lee `Deno.env.get("FACTURAPI_API_KEY")`.

### Enfoque

El API key de Facturapi es un secreto sensible. Se necesitan **dos** API keys (test y live). Se guardarán como secrets del backend, no en la base de datos. El toggle test/live ya existe en el form pero necesita persistirse correctamente.

### Cambios

**1. Agregar dos secrets: `FACTURAPI_TEST_KEY` y `FACTURAPI_LIVE_KEY`**
- Solicitar al usuario ambas keys mediante `add_secret`
- La edge function seleccionará cuál usar según `facturapi_mode` de `company_settings`

**2. `src/pages/CompanySettingsPage.tsx`**
- Agregar campos de texto (enmascarados) para capturar las API keys de test y live
- Agregar un botón "Guardar API Keys" que llame a una nueva edge function para almacenar los secrets
- Corregir el `handleSubmit` para que el toggle test/live se persista junto con los datos fiscales
- Mostrar indicador visual de si cada key está configurada (checkmark verde o advertencia)

**3. Nueva edge function `supabase/functions/save-facturapi-keys/index.ts`**
- Recibe `{ test_key, live_key }` del frontend
- Valida que las keys tengan el formato correcto (`sk_test_*` / `sk_live_*`)
- No es posible guardar secrets desde edge functions directamente — cambio de enfoque

### Enfoque revisado

Dado que los secrets solo pueden configurarse desde las herramientas de Lovable (no programáticamente desde edge functions), el enfoque será:

**1. Persistir el toggle test/live correctamente**
- Corregir `handleSubmit` para incluir `facturapi_mode` al guardar

**2. Solicitar ambas API keys como secrets del backend**
- `FACTURAPI_TEST_KEY` — key de sandbox
- `FACTURAPI_LIVE_KEY` — key de producción
- Usar `add_secret` para que el usuario las ingrese

**3. Actualizar `stamp-cfdi` y `cancel-cfdi`**
- Leer `facturapi_mode` de `company_settings`
- Usar `FACTURAPI_TEST_KEY` o `FACTURAPI_LIVE_KEY` según el modo

**4. Actualizar la UI de la sección PAC**
- Mostrar texto informativo sobre dónde se configuran las keys
- El toggle persiste el modo al guardar los datos fiscales

**5. `src/lib/changelog.ts`** — Nueva entrada v5.12.1

### Archivos modificados
- `src/pages/CompanySettingsPage.tsx` — Incluir `facturapi_mode` en submit, mejorar UI del card PAC
- `supabase/functions/stamp-cfdi/index.ts` — Leer modo y seleccionar key correcta
- `supabase/functions/cancel-cfdi/index.ts` — Leer modo y seleccionar key correcta
- `src/lib/changelog.ts` — Entrada v5.12.1

