

## Almacenar API Keys de Facturapi en la base de datos

### Problema actual
Las API keys de Facturapi se buscan como secrets del backend (`FACTURAPI_TEST_KEY` / `FACTURAPI_LIVE_KEY`), lo cual impide que cada empresa las configure por sí misma desde la UI. El usuario quiere que las keys se guarden en `company_settings` y se editen desde la página de configuración.

### Seguridad
Dado que este es un prototipo interno usado por personal de confianza, almacenar las keys encriptadas en la DB (con `pgcrypto`) sería over-engineering. Se guardarán como texto en `company_settings`, enmascaradas en la UI (input type password), y protegidas por las RLS existentes (solo admin puede escribir, todos los autenticados pueden leer — se restringirá la lectura de los campos sensibles en el frontend). Las edge functions ya usan `SUPABASE_SERVICE_ROLE_KEY` para leer los datos.

### Cambios

**1. Migración SQL** — Agregar columnas a `company_settings`:
- `facturapi_test_key` (text, nullable) — API key de sandbox
- `facturapi_live_key` (text, nullable) — API key de producción

**2. `src/pages/CompanySettingsPage.tsx`**
- Agregar dos campos de texto (type="password") en la sección PAC para Test Key y Live Key
- Indicador visual: icono verde si la key tiene valor, advertencia si está vacía
- Incluir ambas keys en el `handleSubmit` para que se guarden con el resto de datos
- Botón de mostrar/ocultar para cada key

**3. `src/hooks/useCompanySettings.ts`**
- Agregar `facturapi_test_key` y `facturapi_live_key` al tipo del mutation

**4. `supabase/functions/stamp-cfdi/index.ts`**
- Leer `facturapi_test_key` / `facturapi_live_key` de `company_settings` en vez de `Deno.env.get()`
- Mantener fallback a env vars si las columnas están vacías (retrocompatibilidad)

**5. `supabase/functions/cancel-cfdi/index.ts`**
- Mismo cambio: leer keys de `company_settings`, fallback a env vars

**6. `src/lib/changelog.ts`** — Entrada v5.13.0

### Archivos modificados
- Migración SQL (2 columnas nuevas)
- `src/pages/CompanySettingsPage.tsx`
- `src/hooks/useCompanySettings.ts`
- `supabase/functions/stamp-cfdi/index.ts`
- `supabase/functions/cancel-cfdi/index.ts`
- `src/lib/changelog.ts`

