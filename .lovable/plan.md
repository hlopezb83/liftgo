# Auditoría y mejora de la integración de Sentry

## Estado actual (verificado en `elogistix.sentry.io`)

**Sentry está activo y recibiendo eventos**, pero **no hay una sola línea de código Sentry en el repo**:

- `package.json` no lista `@sentry/*`.
- `index.html` no tiene tag `<script>` de Sentry.
- `src/lib/telemetry.ts` es un stub que solo hace `console.*` en DEV.
- `src/layouts/ErrorBoundary.tsx` captura errores React pero solo los `console.error`.

Aun así, Sentry recibe eventos con:
- `release: libre-carga@13.213.11` (auto-versionado por el pipeline de hosting, no coincide con nuestro `public/changelog.json` v6.110.0).
- `environment: production`.
- Tags custom: `active_organization_id`, `organization_id`, `effective_role`, `feature: react_query`, `query_root`, `is_pwa`.
- User identificado por UUID (`user.id`).
- Session Replay activo (con `client_sample_rate: 0.1`).
- Frames minificados (`zU`, `jF`, `MU`) — **no hay source maps subidos** → stack traces ilegibles.
- Cobertura parcial de edge functions (aparece `enviar-factura-email/helpers.ts` en un stack, pero es porque el frontend re-lanza el error, no porque Deno instrumente).

**Conclusión**: la instrumentación la inyecta el pipeline de despliegue (`librecarga.com`) fuera del repo. Eso significa: **no controlamos** qué se envía, cómo se filtra, cómo se etiqueta, ni podemos subir source maps ni enriquecer contexto por vista. La observabilidad es "mejor que nada" pero opaca.

## Hallazgos de las 7 issues abiertas (últimos 30 días)

| ID | Título | Prioridad | Diagnóstico |
|---|---|---|---|
| **REACT-1M** | `zU (captureException)` — 50 eventos, 7 usuarios, regressed | **P0** | Error real de Postgres `22P02: malformed array literal: "[]"` en query `cliente_defaults_facturacion`. Estamos pasando el string `"[]"` a una columna array. |
| **REACT-23** | `Objects are not valid as a React child (found: object with keys {$$typeof, render, displayName})` en `/` | **P1** | Render de una referencia a componente (`{Icon}`) en vez de `<Icon />` — probablemente en Dashboard. |
| **REACT-25** | `Esta organización no tiene FacturApi configurado` | **P2** | Error esperable de UX, no debería llegar a Sentry como unhandled. |
| **REACT-27** | `FacturApi pdf 404: invoice_not_found` desde `enviar-factura-email/helpers.ts` | **P2** | Error de negocio esperable, mismo caso. |
| **REACT-24** | `CFDI40149: DomicilioFiscalReceptor debe pertenecer al RFC` | **P2** | Rechazo SAT ya manejado por diálogo v6.97.10 — no debe re-lanzarse a Sentry. |
| **REACT-1Z** | `HTTP Client Error 502` | Info | Ruido temporal de infra. Filtrar/agrupar. |
| **REACT-26** | `Failed to send a request to the Edge Function` | Info | Error de red del cliente; agrupar con REACT-1Z. |

## Objetivos

1. **Traer la instrumentación al repo** (SDK `@sentry/react` + init controlado) para tener autoridad sobre lo que se reporta.
2. **Subir source maps** en el build para desminificar stacks (fin de los `zU`).
3. **Silenciar ruido** (errores esperables SAT/FacturApi/red) via `beforeSend` y `notifyError({ severity: "warning" })`.
4. **Enriquecer contexto** (org, rol, feature area) desde `AuthContext` una sola vez, no depender del auto-inject.
5. **Cubrir edge functions** con `@sentry/deno` desde un helper compartido.
6. **PII scrubbing** de datos fiscales (RFC, UUID CFDI, folios) en breadcrumbs y tags.
7. **Arreglar los 2 bugs P0/P1 visibles** en Sentry.

## Cambios

### 1. Instalar y configurar `@sentry/react` (fuente de verdad en el repo)

- `bun add @sentry/react` + `@sentry/vite-plugin` (dev dep).
- Nuevo archivo `src/lib/observability/sentry.ts`:
  - `initSentry()` con DSN desde `import.meta.env.VITE_SENTRY_DSN`.
  - `environment` derivado (`production` | `preview` | `development`) desde `import.meta.env.MODE` + hostname.
  - `release` desde `import.meta.env.VITE_APP_VERSION` (inyectado desde `package.json` en `vite.config.ts`).
  - `tracesSampleRate: 0.1`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`.
  - `integrations`: `browserTracingIntegration`, `replayIntegration` (con `maskAllText: false` pero `mask: [".fiscal-sensitive"]` y `blockAllMedia: false`), `reactRouterV6BrowserTracingIntegration` (o el actual).
  - `beforeSend` que:
    - Descarta errores marcados con `tags.silenced = true` (ver punto 4).
    - Descarta patterns conocidos: `/no tiene FacturApi configurado/`, `/CFDI\d{5}/`, `/invoice_not_found/`, `/HTTP Client Error with status code: 5\d\d/`, `/Failed to fetch dynamically imported module/`.
    - Trunca `extra` y `contexts` que contengan `rfc`, `folio_fiscal`, `receptor_rfc` a `"***"`.
  - `beforeBreadcrumb` para omitir `console.*` en producción y sanitizar URLs con query params sensibles.
- `main.tsx`: llamar `initSentry()` antes de `createRoot`.

### 2. Vite plugin para source maps + release

- `vite.config.ts`: agregar `sentryVitePlugin({ org: "elogistix", project: "javascript-react", authToken: process.env.SENTRY_AUTH_TOKEN, release: { name: `liftgo@${pkg.version}` }, sourcemaps: { assets: "./dist/**" } })`.
- `build.sourcemap: true` en Vite config.
- Nuevo build secret **`SENTRY_AUTH_TOKEN`** (Workspace Settings → Build Secrets) — el usuario lo crea en `sentry.io/settings/account/api/auth-tokens/` con scope `project:releases`.
- Release name unifica con `public/changelog.json` para que Sentry y el changelog compartan versión.

### 3. Integrar Auth + Router

- En `AuthContext.tsx`, tras hidratar sesión: `Sentry.setUser({ id, email, username })` y `Sentry.setTag("active_organization_id", orgId)`, `Sentry.setTag("effective_role", role)`. Limpiar en logout con `Sentry.setUser(null)`.
- En `App.tsx` con React Router: usar `Sentry.wrapCreateBrowserRouter` (o `withSentryRouting`) para transacciones nombradas por ruta.

### 4. Integrar `notifyError` con Sentry

`src/lib/ui/appFeedback.ts::notifyError`:
- Si `severity !== "warning"` y `error instanceof Error` → `Sentry.captureException(error, { tags: { phase, step, method, errorCode }, extra: sanitize(context) })`.
- Si `severity === "warning"` → NO enviar a Sentry (silencioso), pero sí a UI. Esto resuelve REACT-25/27/24.

Migración adicional: revisar los ~15 sitios que hoy pasan errores de FacturApi/SAT a `notifyError` y agregarles `severity: "warning"` cuando el error ya está clasificado (via `classifyFacturapiError`).

### 5. Integrar ErrorBoundary con Sentry

- `componentDidCatch`: `Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } }, tags: { boundary_scope: this.props.scope, route_label: this.props.routeLabel } })`.
- Adjuntar `event_id` al UI para que el usuario pueda referenciarlo al soporte ("ID de reporte: ABC123").

### 6. Instrumentar edge functions críticas

- Nuevo `supabase/functions/_shared/sentry.ts` que:
  - Init lazy con `@sentry/deno` (`https://esm.sh/@sentry/deno`).
  - DSN desde `Deno.env.get("SENTRY_DSN_EDGE")` (secret runtime).
  - Helper `withSentry(handler)` que envuelve el `Deno.serve` handler y captura excepciones no atrapadas con tags `function_name`, `request_id`.
- Aplicar `withSentry` en las funciones con más superficie de error: `stamp-cfdi`, `cancel-cfdi`, `generate-recurring-invoices`, `enviar-factura-email`, `parse-cfdi-expense`, `parse-csf`.
- Agregar secret `SENTRY_DSN_EDGE` (mismo DSN o uno separado del proyecto Sentry).

### 7. Arreglar bugs P0/P1 visibles en Sentry

- **REACT-1M** — `cliente_defaults_facturacion` está enviando `"[]"` como literal de array. Localizar el hook (`src/features/customers/hooks/useClienteDefaultsFacturacion*` o similar) y asegurar que se pase `null` o un array real, no un string. Añadir Zod parse en el borde del RPC.
- **REACT-23** — `Objects are not valid as a React child` en `/`. Buscar en Dashboard/Home un `{SomeIcon}` en vez de `<SomeIcon />` (probablemente en una tarjeta KPI o menú lateral).
- **REACT-25/27/24** — Marcar sus `notifyError` con `severity: "warning"` para que dejen de contarse como incidentes (paso 4 los filtra en `beforeSend` también).
- **REACT-1Z/26** — Añadir patrón de red en `beforeSend` para agrupar como "network noise".

### 8. Alertas y housekeeping en Sentry

Fuera de código, documentar en `docs/observability/sentry.md`:
- Alert rule: nueva issue con >5 usuarios en 1h → Slack/email.
- Alert rule: regresión de issue resuelta → notificación inmediata.
- Regla de auto-resolución a 30 días para issues con `tags.silenced` que se colaron.
- Convención de ownership: cada issue asignada al admin del proyecto por defecto; ownership rules por path (`src/features/invoices/*` → responsable X).

### 9. Documentación y changelog

- Nueva sección en `docs/observability/sentry.md` con la arquitectura, cómo agregar tags custom, cómo probar `beforeSend` en local (DEV envía a un DSN dev).
- Changelog `v6.111.0` — "Observabilidad: integración Sentry en repo, source maps, edge functions y limpieza de ruido".

## Detalles técnicos

- **Backward compat con la instrumentación del hosting**: cuando iniciemos nuestro propio SDK, verificar que el pipeline de `librecarga.com` no siga inyectando otro Sentry (doble init causa duplicados). Si el hosting lo hace incondicional, coordinar con soporte para deshabilitar o pasarle el DSN vía env var. Alternativa: si detectamos `window.Sentry` ya inicializado, hacer `Sentry.getCurrentHub().bindClient(newClient)` con misma configuración en vez de re-init.
- **Bundle size**: `@sentry/react` + replay ≈ 90 kB gzip. Cargar `replayIntegration` con lazy import y activarla sólo tras `requestIdleCallback` para no impactar TTI.
- **DSN público**: `VITE_SENTRY_DSN` es publishable, va en `.env` sin problema.
- **Test unitario**: mockear `@sentry/react` en `src/test/setup.ts` para que `Sentry.captureException` sea un spy y no llame red.
- **Fuera de alcance**: cambiar el schema del release (`libre-carga@` → `liftgo@`) requiere coordinación con hosting; propuesto pero opcional. Cambiar a per-user Sentry Feedback widget (queda para fase 2).
