## Problema

El logo de Lift Go no aparece en la página de inicio (`/` AuthPage) ni en `/portal/login` porque el hook `useCompanySettings` consulta la tabla `company_settings`, cuyas políticas RLS solo permiten lectura a usuarios **autenticados** con un rol válido. En la pantalla de login el usuario aún no tiene sesión, por lo que la consulta devuelve `null` y se muestra el fallback "LG".

Esta regresión ocurrió al endurecer las políticas RLS de `company_settings` (que contiene datos sensibles como RFC y llaves de Facturapi), las cuales no deben exponerse públicamente.

## Solución

Crear una **vista pública** `public_branding` que exponga **únicamente** los campos no sensibles necesarios para el branding en pantallas de login: `logo_url` y `razon_social`. Los datos fiscales y llaves de PAC permanecen protegidos.

### Cambios

1. **Migración SQL**
   - Crear vista `public.public_branding` con `SELECT logo_url, razon_social FROM company_settings LIMIT 1`.
   - `GRANT SELECT ON public.public_branding TO anon, authenticated`.
   - Vista marcada con `security_invoker = false` para que ignore las RLS de la tabla base (solo expone 2 columnas seguras).

2. **Hook nuevo**: `src/hooks/usePublicBranding.ts`
   - Query ligera con `staleTime` largo (10 min) que lee de `public_branding`.
   - No requiere sesión.

3. **Reemplazar `useCompanySettings` por `usePublicBranding`** en:
   - `src/pages/AuthPage.tsx` (logo + razón social en header del card)
   - `src/layouts/CustomerPortalLayout.tsx` (header del portal — usado pre y post login del cliente)
   - `src/pages/portal/PortalLogin.tsx` (si aplica)

4. **Changelog**: agregar entrada **patch** v5.42.1 — "Restaurar logo en pantalla de inicio".

## Verificación

- Logo visible en `/` sin sesión iniciada.
- Logo visible en `/portal/login`.
- Datos sensibles (`rfc`, `facturapi_*_key`, `regimen_fiscal`) **siguen protegidos** por RLS para usuarios anónimos.
- 0 errores TS / ESLint.
