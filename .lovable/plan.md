## Contexto y adaptaciones

El proyecto usa **sonner** (no shadcn toast). Mantengo toda la arquitectura de tu spec — `ErrorReport`, builder, extractor, catálogo, snapshot de auth, store con `useSyncExternalStore`, diálogo global — pero construida sobre sonner. Esto evita migrar 91 archivos y respeta la regla de memoria "Error handling globally via sonner".

Notas clave:

- No se crea `toast.tsx`, `toaster.tsx` ni `useToast`. Se usa `toast` de sonner directamente.
- Variantes `success` / `warning` / `error` se logran con tokens semánticos + `classNames` en el wrapper `src/components/ui/sonner.tsx`.
- LiftGo hoy es single-tenant: `organization` en el snapshot queda como `null` (campo presente pero opcional para uso futuro).
- `APP_VERSION` se lee del primer entry de `public/changelog.json` cacheado en módulo.

## Archivos a crear

1. `**src/lib/ui/errorReport.ts**` — Interfaz `ErrorReport` (requestId UUID v4 vía `crypto.randomUUID`, errorCode, method, title, description, phase, step, version, timestampIso, timezone, route, user, client, errorDetails, context) + `buildErrorReport(input)`.
2. `**src/lib/ui/errorDetailsExtract.ts**` — `extractErrorDetails(error)` detecta: `Error` nativo, `PostgrestError` (message/details/hint/code), `ZodError` (directo o en `error.cause`) → `validationErrors: [{path, message, code}]`, `Response` HTTP (status), string. `deriveErrorCode(error)` mapea a códigos del catálogo (P0001/RLS → DB_PERMISSION_DENIED, 23505 → DB_UNIQUE_VIOLATION, 23503 → DB_FOREIGN_KEY, ZodError → VALIDATION_FAILED, fetch fail → NETWORK_ERROR, 401/403 → AUTH_REQUIRED, 404 → NOT_FOUND, 429 → RATE_LIMITED, 5xx → INTERNAL_ERROR, fallback UNKNOWN).
3. `**src/lib/domain/errorCatalog.ts**` — `ERROR_CODES` const + mensajes es-MX. Núcleo: `VALIDATION_FAILED`, `DB_PERMISSION_DENIED`, `DB_UNIQUE_VIOLATION`, `DB_FOREIGN_KEY`, `NETWORK_ERROR`, `AUTH_REQUIRED`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`, `UNKNOWN`. Dominio LiftGo: `BOOKING_OVERLAP`, `FORKLIFT_UNAVAILABLE`, `MAINTENANCE_BLOCK`, `QUOTE_NOT_EDITABLE`, `QUOTE_GENERIC_CUSTOMER`, `INVOICE_ALREADY_PAID`, `INVOICE_CANCELLED`, `CFDI_FACTURAPI_ERROR`, `MODELS_REQUIRED`, `PAYMENT_EXCEEDS_BALANCE`, `RECURRING_BILLING_LOCKED`, `ROLE_FORBIDDEN`. Helpers `msg(key)` y `getMessage(key, vars)` con interpolación `{var}`.
4. `**src/lib/errors/index.ts**` — `getErrorMessage(err): string` con tabla `FRIENDLY_ERROR_MESSAGES` (regex → mensaje amigable, p.ej. `/duplicate key/` → "Ya existe un registro con esos datos", `/violates row-level/` → "No tienes permisos para esta acción", `/Failed to fetch/` → "Sin conexión").
5. `**src/lib/ui/authSnapshot.ts**` — Singleton sincrónico: `getAuthSnapshot()` retorna `{ user: {id,email} | null, organization: null, role: AppRole | null }`. `setAuthSnapshot(snapshot)` actualiza el módulo.
6. `**src/lib/ui/errorDetailsStore.ts**` — Store con `useSyncExternalStore`. Exporta `openErrorReport(report)`, `closeErrorReport()`, hook `useErrorReport()`. Sin Context.
7. `**src/lib/ui/errorReportFormat.ts**` — `formatReportText(report): string` produce texto plano legible (header + error + context + stack) listo para copiar.
8. `**src/lib/ui/appFeedback.ts**` — `notifyError({ step?, phase?, errors?, message?, description?, title?, error?, context?, errorCode?, method? })`, `notifyWarning({title,description?})`, `notifySuccess({title,description?})`. Título de `notifyError`: si `step` → "Revisa el Paso N: <STEP_LABELS[N]>"; si `phase` → "Error: &nbsp;"; si no, "Error". El toast destructive es persistente (`duration: Infinity`) con `action: { label: "Ver detalles", onClick: () => openErrorReport(report) }` cuando hay error real para reportar; success/warning son normales.
9. `**src/components/ui/ErrorDetailsDialog.tsx**` — Diálogo global controlado por `useErrorReport()`. Muestra `<pre>` con texto formateado, secciones: header (versión/ruta/usuario/requestId), error block, context block, stack block. Botón "Copiar reporte" usa `navigator.clipboard.writeText`. Toast de confirmación al copiar.
10. `**src/lib/crm/crmToast.ts**` (opcional, ya solicitado) — Wrapper delgado de sonner con `success/error/info/undo`.

## Archivos a modificar

11. `**src/index.css**` — Añadir `--success` y `--warning` (HSL) en `:root` y `.dark` (verde y ámbar coherentes con paleta industrial; reutilizo los `status-*` ya existentes para mantener consistencia).
12. `**tailwind.config.ts**` — Registrar `success`, `success-foreground`, `warning`, `warning-foreground` en `theme.extend.colors` usando `hsl(var(--*))`.
13. `**src/components/ui/sonner.tsx**` — Extender `toastOptions.classNames` con `success` (border-success bg-success/10 text-foreground), `warning` (border-warning bg-warning/10), `error` (border-destructive bg-destructive/10). Mantener API actual intacta para los 91 archivos existentes.
14. `**src/contexts/AuthContext.tsx**` — Dentro del `onAuthStateChange` y al cargar el rol, llamar `setAuthSnapshot({ user, role, organization: null })`. Importar el rol vía un pequeño efecto separado o exponiendo el setter que use `useUserRole` desde un componente puente. **Implementación elegida**: agregar un componente interno `<AuthSnapshotSync />` montado en `AppProviders` después de `AuthProvider` que use `useAuth()` + `useUserRole()` y llame `setAuthSnapshot` en cada cambio (evita acoplar AuthContext a roles).
15. `**src/layouts/AppProviders.tsx**` — Montar `<ErrorDetailsDialog />` junto al `<Sonner />` existente, y añadir `<AuthSnapshotSync />` dentro del `AuthProvider`.
16. **Changelog 6.14.0 (minor / feature)** — `public/changelog.json` + `public/changelog/v6.14.0.json` describiendo el sistema unificado y cómo usar `notifyError`.

## Lo que NO cambia

- Los 91 archivos que ya usan `toast.success/error/info` de sonner siguen funcionando idéntico.
- No se agrega ninguna dependencia npm.
- No se toca el stack de shadcn toast (no existe en el proyecto, no se crea).
- RLS, RPCs, lógica de negocio, rutas: intactos.

## Migración futura (no en este PR)

Documentar en el changelog que llamadas a `toast.error(...)` para errores de mutación deberían migrarse gradualmente a `notifyError({ error, phase, context })`. No se migran ahora para mantener el cambio acotado y revisable.

## Detalles técnicos relevantes

- `crypto.randomUUID()` está disponible en todos los navegadores soportados; sin polyfill.
- `useSyncExternalStore` (React 18, ya en el stack) evita re-renders globales al abrir el diálogo.
- `getAuthSnapshot()` es sincrónico y seguro de llamar fuera de componentes, indispensable para `buildErrorReport` invocado dentro de callbacks de toast.
- `requestId` se incluye en el reporte para futura correlación con logs de Edge Functions vía header `X-Request-Id` (no se implementa propagación ahora, sólo se genera el id).

Usa subagentes si es posible. 