# Arquitectura — LiftGo ERP

> Documento vivo. Actualízalo cuando cambien decisiones estructurales (rutas, capas, integraciones, modelo de seguridad, reglas de negocio invariantes). Los cambios funcionales se registran en el changelog (ver §12).

---

## 1. Introducción

LiftGo es un ERP interno para la operación de una empresa de renta y venta de montacargas. Centraliza:

- **Operaciones**: flota, reservas, calendario, entregas, devoluciones, mantenimiento, inventario de refacciones, daños.
- **Comercial**: CRM/prospectos, clientes, cotizaciones (renta y venta), contratos.
- **Finanzas**: facturación CFDI 4.0, pagos, gastos operativos, estado de resultados, MRR, proveedores.
- **Administración**: gestión de usuarios, permisos por rol, configuración de empresa, bitácora de auditoría, ayuda y changelog.
- **Feedback interno**: reportes de usuarios (FAB), `/mis-reportes`, leaderboard público y gestión Kanban admin (`mem://features/feedback`).
- **Portal de cliente**: vista de solo lectura para clientes finales.

**Audiencia**: desarrolladores y nuevos integrantes del equipo. Contexto de despliegue: aplicación interna, optimizada para escritorio (≈99% del uso), localizada para México (es-MX, zona horaria `America/Monterrey`, MXN).

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| UI | React 19, Vite 8, TypeScript 6, Tailwind CSS v4 (configurado en `src/styles.css`, sin `tailwind.config.ts`) |
| Framework de app | TanStack Start 1.x + TanStack Router 1.x (rutas por archivo en `src/routes/`, SSR) |
| Componentes | shadcn/ui sobre Radix UI, lucide-react |
| Estado servidor | TanStack Query v5 (con persistencia en `localStorage`) |
| Formularios | react-hook-form + Zod |
| Routing | TanStack Router (file-based) con `lazy()` + `Suspense` por ruta |
| Backend | Lovable Cloud (Supabase): Postgres + Auth + Storage + Edge Functions (Deno) |
| Server functions | `createServerFn` de `@tanstack/react-start` (`src/lib/*.functions.ts`) |
| Despliegue | Build SSR con Nitro, preset `cloudflare-module` → `dist/client` + `dist/server` (ver `wrangler.jsonc`) |
| Documentos | `@react-pdf/renderer` ^4.x (declarativo, JSX → PDF, carga diferida) |
| Notificaciones | sonner |
| Tests | Vitest 4 + @testing-library/react + happy-dom (jsdom opt-in por archivo); Playwright para E2E |
| Integraciones externas | Facturapi (CFDI 4.0), Lovable AI Gateway |
| Observabilidad | Sentry (`@sentry/react` + `@sentry/vite-plugin`) |

Requisitos de entorno: Node `>=24` (ver `engines` en `package.json`, `.nvmrc` y `.node-version`); el gestor de paquetes y runner de scripts es **Bun**.

---

## 3. Diagrama de alto nivel

```text
┌─────────────────────────────────────────────────────────────┐
│        Navegador (React 19 + TanStack Query/Router)         │
└──────────────┬──────────────────────────────┬───────────────┘
               │ HTTPS                        │ HTTPS
               ▼                              ▼
   ┌──────────────────────────┐     ┌──────────────────────┐
   │  Worker SSR (Nitro /     │     │  Supabase Auth       │
   │  Cloudflare)             │     │  (JWT + RLS)         │
   │  src/server.ts →         │     └──────┬───────────────┘
   │  TanStack Start          │            │
   │  + server functions      │            │
   └───────────┬──────────────┘            │
               │                           │
               ▼                           ▼
      ┌────────────────────────────────────────────┐
      │          Postgres (RLS por rol)            │
      │  has_role() SECURITY DEFINER · RPCs        │
      │  triggers de auditoría · constraints GiST  │
      └────────────────────────────────────────────┘
                ▲
                │
    ┌───────────┴──────────────┐   ┌──────────────────────┐
    │  Edge Functions (Deno)   │   │  Servicios externos  │
    │  CFDI, cron, storage     │──▶│  Facturapi · AI      │
    └──────────────────────────┘   └──────────────────────┘

Los servicios externos (Facturapi, AI) **no** acceden a Postgres: solo los
invocan las Edge Functions o el código servidor, que sí consultan la base.
```

El SSR corre en un Worker: `src/server.ts` envuelve el handler de
`@tanstack/react-start/server-entry` para convertir errores catastróficos en una
página HTML de error (`src/lib/error-page.ts`). `src/start.ts` registra los
middlewares de request (errores + CSRF) y el middleware de cliente que adjunta
el Bearer de la sesión a las server functions.


---

## 4. Estructura de carpetas

El código del cliente está organizado **por feature** (vertical slicing). Cada feature es autocontenida: páginas, componentes, hooks y helpers viven juntos. `src/pages/` ya no existe — toda página vive en su feature.

```text
src/
├── features/                       Feature slices (una carpeta por dominio)
│   └── <feature>/                  bookings, invoices, quotes, crm, fleet, ...
│       ├── pages/                  Orquestadores de ruta (thin containers)
│       ├── components/             UI específica de la feature
│       ├── hooks/                  Hooks de datos + lógica (TanStack Query)
│       │   └── <entity>/           Sub-hooks por entidad (Query / Mutations / Builders)
│       └── lib/                    Helpers puros (*Helpers.ts) y builders (*Builder.ts)
├── components/                     UI verdaderamente compartida entre features
│   ├── ui/                         Primitivas shadcn (no editar)
│   └── *.tsx                       DetailPageHeader, EmptyState, TotalsSummary, ...
├── hooks/                          Hooks transversales (useListPage, useDialogState, ...)
├── contexts/                       AuthContext (sesión global)
├── layouts/                        MainLayout, CustomerPortalLayout, AuthGuard, RoleGuard
├── app-routes/
│   ├── routes.ts                   Constantes de URL (`ROUTES.invoices.detail(id)`)
│   ├── routes-config.tsx           Registro heredado: loaders lazy + metadatos para sidebar/búsqueda
│   └── RouteSkeletons.tsx          Fallbacks de Suspense
├── routes/                         Rutas file-based de TanStack Router
│   ├── __root.tsx                  Shell HTML, head/meta, providers, error/not-found
│   ├── _main.tsx · _main/          ERP autenticado (AuthGuard + MainLayout)
│   ├── _portal.tsx · _portal/      Portal de cliente
│   ├── auth.tsx · portal.login.tsx Rutas de acceso
│   └── ../routeTree.gen.ts         GENERADO — no editar
├── lib/
│   ├── pdf/                        Generación modular de documentos
│   ├── forms/                      Mapeo formulario → payload (coerce, payloads compartidos)
│   ├── domain/                     Helpers de dominio cross-feature (invoiceTotals, satCatalogs)
│   ├── *.functions.ts              Server functions (`createServerFn`)
│   ├── server/ · *.server.ts       Código server-only (guards, clientes privilegiados)
│   ├── constants.ts                Etiquetas, colores, estados de dominio
│   ├── config.ts                   Configuración global (tasas IVA, monedas)
│   └── formatCurrency.ts · utils.ts · rpc.ts · router-compat*.ts · ...
├── integrations/supabase/          Cliente, middleware de auth y types AUTOGENERADOS — no editar
├── types/                          Tipos de dominio compartidos (rental.ts, ...)
├── test/                           Tests + helpers/mocks de Supabase
├── styles.css                      Tailwind v4 + tokens de diseño (sin tailwind.config.ts)
├── router.tsx                      `createRouter` (QueryClient por request, scroll, search parsing)
├── start.ts                        Middlewares de request (errores, CSRF) y de server functions
└── server.ts                       Entrada SSR del Worker (envoltura de errores)
supabase/
├── functions/                      Edge Functions Deno (CFDI, cron, storage)
├── migrations/                     Migraciones SQL históricas (timestamp + slug)
├── tests/                          Smokes SQL y suites de RLS
└── config.toml                     Configuración de funciones (verify_jwt, etc.)
drizzle/
├── schema.ts                       Esquema usado por drizzle-kit
└── migrations/                     Migraciones numeradas (`00NN_<slug>.sql`), multi-organización
public/
├── changelog.json                  Índice del historial funcional (ver §16)
├── changelog/v<X.Y.Z>.json         Detalle por versión
└── version.json                    Versión vigente (generada por `scripts/gen-version.mjs`)
```

> `src/App.tsx` y `src/main.tsx` ya no existen: su contenido (providers, shims,
> arranque de Sentry, meta tags) vive en `src/routes/__root.tsx` y `src/layouts/AppProviders.tsx`.


**Reglas de ubicación**:
- Toda lógica/UI/hook específica de un dominio → `src/features/<feature>/`.
- Solo lo verdaderamente compartido entre 2+ features sube a `src/components/`, `src/hooks/` o `src/lib/`.
- Tipos locales a un componente viven con el componente; tipos cross-feature → `src/types/`.
- Cuando un componente > 150 LOC o un hook > 80 LOC, se modulariza extrayendo sub-componentes/hooks (ver §19).

---

## 5. Patrones arquitectónicos

### 5.1 Separación de responsabilidades

```text
Página (orquestador)
   └─► Hook de dominio (TanStack Query + lógica)
          └─► Cliente Supabase / RPC
   └─► Componente (UI pura, recibe datos por props)
```

- **Páginas** sólo coordinan: leen params, montan layout, conectan hooks con componentes.
- **Hooks de dominio** son la única capa que habla con Supabase. Granulares por entidad y por intención (`useInvoices`, `useCreateInvoice`, `usePortalInvoices`).
- **Componentes** son tontos: reciben datos y callbacks; no consultan la BD.

### 5.2 Patrones reutilizables de UI

- `useListPage` consolida filtros + orden + paginación + búsqueda para todas las páginas de listado.
- Bloques composables: `useListFilters`, `useDebouncedValue`, `useSort`, `usePagination`, `useDialogState`. `useFormState` está `@deprecated` (`TODO(deps)` → migrar a `react-hook-form`).
- Componentes estándar: `ListPageLayout`, `DetailPageHeader`, `FormPageHeader`, `TotalsSummary`, `EmptyState`, `StatusBadge`, `MobileCardList`, `ReadOnlyLineItemsTable`, `TablePagination`.
- **Tablas avanzadas**: `DataTableV2` (`src/components/dataTable/v2/`) envuelve TanStack Table con `useLiftgoTable`; defaults seguros (`autoResetPageIndex: false`, sorting controlado, paginación cliente de 25). Reemplaza al antiguo `SortableTableHead` (eliminado en v6.12.x).
- Multimedia: `DragDropImageUploader` + `ImageGalleryLightbox`, indexados por `entityType`/`entityId`.
- Restauración de filtros al volver a un listado mediante `sessionStorage`.
- **Estabilidad de referencias en filtros**: las dependencias de `useMemo` en `useListFilters` deben ser estables; arrays/objetos literales en cada render disparan loops infinitos con `autoResetPageIndex` (lección del fix v6.12.5).

### 5.3 Mutaciones y caché

- Toda mutación invalida o actualiza el caché de TanStack Query (`setQueryData` para optimistic, `invalidateQueries` para consistencia).
- **Optimistic UI** en eliminaciones: navegación inmediata + rollback en `onError`.
- Errores de mutación se reportan con `sonner` (`toast.error/warning`), nunca con `alert` ni `console`.

### 5.4 Integridad transaccional

- Flujos multi-tabla (crear reserva, completar inspección, cancelar reserva, conversión cotización→reserva) viven como **RPCs de Postgres** (`SECURITY DEFINER`, `SET search_path = public`) para garantizar atomicidad.
- Restricciones críticas (solapamiento de reservas) se hacen a nivel BD con índices/exclusión GiST, no en cliente.
- Validaciones temporales se implementan como **triggers** (no `CHECK` con `now()`, que rompe restores).

### 5.5 Type-safety

- Sin `any`, sin `!` (non-null assertion), sin casts manuales `as` salvo en límites explícitos.
- En `catch (e)` el error es `unknown`; se valida antes de usar.
- Validación de formularios y payloads externos con **Zod**.
- Tipos de BD se importan desde `@/integrations/supabase/types` (`TablesInsert<>`, `TablesUpdate<>`).

---

## 6. Capa de datos y seguridad

### 6.1 RLS y roles

- **Toda tabla** tiene RLS habilitada.
- Roles internos en enum `app_role`:
  - `admin` — control total, único que puede revertir auditoría y marcar oportunidades como Closed Won.
  - `administrativo` — operación administrativa amplia (facturación, pagos, clientes).
  - `ventas` — CRM, cotizaciones, clientes.
  - `despachador` — reservas, calendario, entregas, devoluciones.
  - `mecanico` — mantenimiento, daños, refacciones.
  - `auditor` — solo lectura transversal + bitácora.
- Tabla `user_roles` **separada** de `profiles` para evitar escalada de privilegios.
- Función `public.has_role(_user_id uuid, _role app_role)` `SECURITY DEFINER STABLE SET search_path = public` se usa en todas las policies. Ejemplo:

  ```sql
  create policy "Admins manage invoices"
    on public.invoices for all to authenticated
    using (public.has_role(auth.uid(), 'admin'))
    with check (public.has_role(auth.uid(), 'admin'));
  ```

### 6.2 Permisos por módulo

- Tabla `role_permissions` (`role` × `module` × `access_level`: `none|read|full`).
- Constante `MODULES` y mapa `ROUTE_TO_MODULE` definidos en `src/features/users/hooks/useRolePermissions.ts` — única fuente de verdad para nombrar módulos en UI y BD.
- Hook `useRolePermissions` carga el mapa con `staleTime: 5 min`.
- Componente `<RoleGuard module="..." minAccess="read">` envuelve cada ruta protegida.
- Cada entrada de `appRoutes` declara `module` opcional (y `minAccess` / `adminOnly` cuando aplica); el archivo de ruta correspondiente en `src/routes/_main/` lo enlaza a `RoleGuard`.

> **Multi-organización (en curso, no terminada)**: el esquema ya incorpora
> `organizations`, `organization_memberships`, `organization_customers`,
> `customer_portal_accounts` y la columna `organization_id` en las tablas
> operativas (migraciones `drizzle/migrations/00NN_multi_org_*`). Hoy opera una
> sola organización. Esta revisión documental no certifica el cierre de la
> migración: cualquier pendiente concreto debe confirmarse contra el código
> vigente antes de dar el aislamiento multiempresa por completo.

**Fase 1 implementada — aislamiento fiscal en Edge Functions (8.8.5).**
`supabase/functions/_shared/orgContext.ts` centraliza la resolución de
organización en servidor: `resolveCallerOrganization(admin, userId)` (lee
`organization_memberships` con `member_type='internal'`; fail-closed: 403 sin
membresía, 503 si el lookup falla, 409 si hay más de una),
`assertDocumentOrganization` / `resolveDocumentOrganization` (compara la
organización del caller contra la del documento leído en BD; un JWT
`service_role` no hereda organización del usuario) y `groupByOrganization`
para los crons. Reglas: la organización jamás se toma del payload ni del
navegador, y la verificación ocurre **antes** de cualquier claim, UPDATE,
lectura de secretos o llamada al PAC.

`supabase/functions/_shared/facturapi/client.ts` sustituyó `getFacturapiConfig`
(que leía `limit(1)`) por `getFacturapiConfigForOrganization({ admin, env,
organizationId, modeOverride? })`, que filtra `company_settings` y
`billing_secrets` por `organization_id`. El fallback a las llaves de entorno
`FACTURAPI_TEST_KEY`/`FACTURAPI_LIVE_KEY` sólo aplica mientras exista
exactamente **una** organización (`isSoleLegacyOrganization`); se retira
cargando las llaves de la empresa en `billing_secrets` y borrando esos
secretos del entorno.

Consumidores adaptados: `stamp-cfdi`, `cancel-cfdi`,
`refresh-cancellation-status`, `download-cfdi`, `stamp-credit-note`,
`cancel-credit-note`, `stamp-payment-complement`,
`cancel-payment-complement`, `validate-receptor-tax-info`,
`validate-customers-tax-info`, `reconcile-stamping-invoices`,
`process-cfdi-retry-queue`, `generate-recurring-invoices` y
`generate-recurring-maintenance`. Los crons agrupan por organización y usan un
cliente Facturapi por empresa; un fallo o una empresa sin credenciales no
contamina a las demás. `cancel-credit-note`, `stamp-payment-complement` y
`download-cfdi` se reestructuraron al patrón `handler.ts` (inyección de
dependencias) + `index.ts` wrapper para poder probarse sin red.

**Corrección 8.8.7 (portal, configuración explícita y cola).**
`resolvePortalAccess(admin, userId)` en `_shared/orgContext.ts` es la ruta de
acceso de los CLIENTES del portal: exige exactamente una fila activa en
`customer_portal_accounts` y una membresía `member_type='portal'` de la misma
organización (0 o >1 → 403; error de lectura → 503; discrepancia → 403). El
resolver interno sigue cerrado a cuentas de portal. `download-cfdi` combina
organización + cliente propietario para factura, acuse, REP y nota de crédito,
y en REP verifica además la organización de la factura relacionada; todas sus
rutas usan `deps.fetchImpl`/`deps.env` (sin `fetch`/`Deno.env` globales) para
que las pruebas sean realmente sin red.
`getFacturapiConfigForOrganization` lanza `FacturapiConfigError`
(`config_read_error` | `config_missing` | `config_invalid_mode` |
`organization_required`) ante error de lectura, configuración ausente
(incluido `modeOverride: null`) o modo inválido: nunca devuelve una llave ni
cae al entorno, y los handlers con reserva liberan el claim antes de
responder. `loadFacturapiConfigOutcome` ofrece la misma política sin
excepciones (503 lectura / 400 configuración).
En `process-cfdi-retry-queue`, `classifyInvoiceReadOutcome` (en
`decisions.ts`) separa el fallo transitorio de lectura —se difiere con backoff
sin consumir intento ni llamar al PAC— de la factura realmente sin
organización, que sí se agota.

**Storage por organización (migración `0022_storage_tenant_scoped_policies.sql`).**
Las rutas nuevas son `{organization_id}/...`. Las policies ya no se limitan a
recortar el prefijo: `storage_prefix_organization(p)` resuelve la organización
del prefijo, `storage_path_in_current_organization(p, p_require_prefix)` exige
que coincida con `current_organization_id()` (membresía real; `true` en las
subidas, que por tanto obligan a llevar prefijo) y
`payment_proof_path_allowed(name, p_require_prefix)` valida además que el
segmento de cliente sea el del usuario y que la factura de la ruta sea de ese
cliente y de esa organización. `customer_payment_intents` suma
`invoice_in_current_organization(invoice_id)`. Los objetos legados sin prefijo
conservan lectura y borrado porque no pueden apuntar a otra organización; no se
admiten subidas nuevas sin prefijo. Cobertura: suite RLS
`supabase/tests/rls/storage_org_prefix.sql` (dos organizaciones con un cliente
compartido) y asertos R6-15/R6-25 en `supabase/tests/r_fix32_portal_pagos_smoke.sql`.







### 6.3 Server functions vs Edge Functions

La lógica de servidor está repartida en dos transportes, con criterio explícito:

**Server functions (`createServerFn`, corren en el Worker SSR)** — lógica
interna de la app llamada desde el cliente. Viven en `src/lib/*.functions.ts`:

- `userAdmin.functions.ts` — invitar, eliminar, restablecer contraseña y activar/desactivar usuarios internos (antes Edge Functions homónimas).
- `customerPortal.functions.ts` — invitación al portal de clientes.
- `supplierRep.functions.ts` — validación/parseo de REP de proveedores.
- `feedbackAi.functions.ts` — clasificación asistida de reportes de feedback.

Reglas: autenticación vía middleware `requireSupabaseAuth`
(`src/integrations/supabase/auth-middleware.ts`); el Bearer se adjunta desde el
cliente con el `functionMiddleware` registrado en `src/start.ts`; el código
privilegiado vive en archivos `*.server.ts` / `src/lib/server/` importados
dentro del handler, nunca desde un componente.

**Edge Functions (Deno, en Supabase)** — integraciones externas, jobs
programados y trabajo con privilegios de servicio:

- Validan identidad con `getClaims()` o con el secreto de cron según el caso; CORS centralizado en `supabase/functions/_shared/cors.ts` y validación de inputs en `_shared/validate.ts`.
- CFDI: `stamp-cfdi`, `cancel-cfdi`, `download-cfdi`, `stamp-credit-note`, `cancel-credit-note`, `stamp-payment-complement`, `cancel-payment-complement`, `refresh-cancellation-status`, `process-cfdi-retry-queue`, `reconcile-stamping-invoices`.
- Validación fiscal: `validate-customers-tax-info`, `validate-receptor-tax-info`, `validate-supplier-rep`, `parse-csf`.
- Jobs: `generate-recurring-invoices`, `generate-recurring-maintenance`, `migrate-storage-org-prefix`.
- Otros: `generate-manual`, `classify-feedback-report`, y las funciones de usuarios cuya versión Deno sigue **presente en el repositorio** mientras se retira (esta revisión documental no verifica su estado de despliegue).
- `verify_jwt` se configura por función en `supabase/config.toml` cuando aplica.

---

## 7. Enrutamiento y autorización

- Enrutamiento **file-based** de TanStack Router: cada archivo bajo `src/routes/` genera una ruta; `src/routeTree.gen.ts` es **generado** y no se edita.
- Árbol actual:

  ```text
  __root.tsx            Shell HTML + head/meta + AppProviders + ErrorBoundary
    ├─ auth.tsx                     Login interno
    ├─ portal.login.tsx             Login del portal
    ├─ _main.tsx                    AuthGuard → MainLayout
    │    └─ _main/<ruta>.tsx        Suspense → RoleGuard? → Page (lazy)
    └─ _portal.tsx                  AuthGuard → CustomerPortalLayout
         └─ _portal/portal.*.tsx    Páginas del portal
  ```

- Los segmentos `_main` y `_portal` son layouts sin URL propia: `/invoices` vive en `src/routes/_main/invoices.index.tsx`.
- Cada archivo de ruta declara sus propios guards: importa la página con `lazy`, define `module`/`minAccess` localmente y monta `Suspense` + `RoleGuard` (ej. `src/routes/_main/invoices.index.tsx`). **No** importan `routes-config.tsx`.
- `src/app-routes/routes-config.tsx` es un registro heredado del router previo: hoy lo consumen el sidebar (`SidebarNavSection`, `SidebarQuickCreate`), la búsqueda global (`GlobalSearch`) y pruebas — no es la fuente efectiva de permisos en runtime.
- `MainLayout` se monta una sola vez (layout route); `Suspense` envuelve cada página individual.
- Constantes de URL en `src/app-routes/routes.ts` (`ROUTES.invoices.detail(id)`) para evitar strings mágicos.
- La navegación usa `Link`/`navigate` de TanStack Router; `src/lib/router-compat-ui.tsx` y `src/lib/router-compat-url.ts` ofrecen equivalentes (`Navigate`, lectura de query string) para el código migrado.
- Rutas notables fuera de los CRUD: `/income-statement`, `/mrr`, `/expenses` (operativos), `/audit`, `/activity`, `/users/permissions`, `/settings/operations`, `/changelog`, `/help`, `/feedback` (admin Kanban), `/mis-reportes`, `/leaderboard`.


---

## 8. Portal de cliente

- Aislado bajo `/portal/*` con `CustomerPortalLayout` y autenticación independiente (`/portal/login`).
- Páginas: `PortalDashboard`, `PortalRentals`, `PortalInvoices`, `PortalInvoiceDetail`, `PortalContracts`.
- Hooks dedicados (`useCustomerPortal`, `usePortalInvoices`, `usePortalBookings`) que **nunca** comparten queries con el backoffice.
- Modelo de seguridad: los clientes invitados desde la server function `inviteCustomer` (`src/lib/customerPortal.functions.ts`) quedan vinculados a un `customer_id`. Las policies RLS filtran por ese `customer_id`. Acceso **solo lectura**.
- Sin acceso a módulos internos (gastos, P&L, mantenimiento, etc.).

---

## 9. Generación de documentos (PDFs)

Motor: **`@react-pdf/renderer`** (declarativo, JSX → PDF). La migración desde el jsPDF imperativo se completó en `v6.6.0-alpha.1`; ya no queda código jsPDF en el bundle.

```text
src/lib/pdf/
├── documents/                  Documentos React-PDF (uno por tipo)
│   ├── InvoiceDocument.tsx
│   ├── QuoteDocument.tsx
│   ├── ContractDocument.tsx
│   ├── CustomerStatementDocument.tsx
│   ├── IncomeStatementDocument.tsx
│   └── contract/               ContractBody, ChecklistAnnex, PagareAnnex
├── components/                 Bloques compartidos (Header, Footer, InfoCards,
│                               LineItemsTable, TotalsBox, AccentBar)
├── theme/
│   ├── tokens.ts               Única fuente de tokens visuales (colores,
│   │                           tipografía, márgenes A4)
│   └── styles.ts               StyleSheet.create compartido
├── contract/                   Datos: placeholderRegistry, placeholders,
│                               data-templates, fetchers
├── quote/build.tsx             Builder de descarga
├── shared.ts                   Helpers compartidos (datos de empresa)
└── loadImageAsBase64.ts        Logo embebido en base64
```

- `theme/tokens.ts` es la **única fuente de tokens visuales**. Cualquier color, tamaño de fuente o margen vive aquí.
- `placeholderRegistry.ts` sigue siendo la **única fuente de verdad** para tokens de plantillas de contrato (consumido por el editor y por el generador).
- El builder del PDF se importa de forma **diferida** (`await import()`) desde el botón que dispara la descarga para mantener el bundle inicial liviano.
- Logo escalado a 24×40 mm máx. para mantener layout (`mem://style/branding/logo`).

---

## 10. Integraciones externas

- **Facturapi (CFDI 4.0)**: timbrado y cancelación de comprobantes. Multi-tenant: cada empresa configura sus API keys (test y live) en `company_settings` / `pac_config`. Edge functions: `stamp-cfdi`, `cancel-cfdi`. PDFs e XML se persisten como adjuntos.
- **Lovable AI Gateway**: usado por funciones que requieren modelos LLM (p. ej. `generate-manual`). Sin API key del usuario; consumo manejado por la plataforma.
- **Parseo de CSF (SAT)**: `parse-csf` extrae RFC, razón social, régimen y código postal de la Constancia de Situación Fiscal para precargar formularios de cliente.

---

## 11. Convenciones de UI/UX

- **Desktop-first**: alta densidad, atajo global `Ctrl+K`, drill-down en side panels en lugar de columnas de acciones.
- Tablas estandarizadas: compactas, filas zebra, headers sticky, sort/paginación cliente (límite 25, vía `usePagination`).
- Mobile: `MobileCardList` reemplaza tablas complejas.
- Diseño visual “Premium / Industrial Minimalista” para documentos operativos.
- **Tokens semánticos**: nunca colores literales (`text-white`, `bg-black`). Todo color en HSL dentro de `src/styles.css` (Tailwind v4 con `@theme`/`@layer base`, sin `tailwind.config.ts`). Componentes usan tokens (`bg-primary`, `text-muted-foreground`, etc.).

---

## 12. Localización

- Zona horaria fija `America/Monterrey` mediante `nowMty()` en `lib/utils.ts`.
- Fechas: formato DD/MM/YYYY; manipulación con `date-fns` + `date-fns-tz`.
- Moneda MXN por defecto, formato `es-MX` vía `formatCurrency()`.
- Soporte multi-moneda (MXN/USD) en cotizaciones.
- UI 100% en **español mexicano**. Identificadores de documentos con prefijos en español: `FAC-`, `COT-`, `CTR-`, `RSV-`, `ENT-`, `DEV-` (generados por RPCs de numeración).

---

## 13. Reglas de negocio críticas (invariantes)

Documentar aquí cualquier regla que NO sea evidente del código y que, si se viola, rompe el dominio.

- **Renta calculada por meses calendario exactos**, no por bloques de 30 días (`mem://logic/rental-calculation`).
- **Numeración de documentos** generada por RPCs (`generate_*_number`) para evitar colisiones; prefijos en español por tipo.
- **MRR y ocupación** se computan estrictamente sobre reservas activas confirmadas hoy; la página `/mrr` es la fuente de verdad para los KPIs del dashboard (`mem://logic/kpi-calculation-rules`, `mem://features/mrr-detail-page`).
- **Estado del montacargas** (`available`, `rented`, `maintenance`, ...) se cambia solo por eventos explícitos (entrega, devolución, mantenimiento), nunca derivado en queries (`mem://logic/forklift-status-persistence`).
- **Buffer de mantenimiento** de 3 días para reservas activas, aplicado vía exclusión GiST (`mem://logic/booking-constraints`).
- **Cotizaciones multi-equipo**: ID primario en `forklift_id`, lista completa en `line_items` JSONB; mapeo de unidades vendidas en `quote_assigned_forklifts` (`mem://logic/multi-equipment-rental-storage`, `mem://logic/quote-assignment-mapping`).
- **Subscripciones recurrentes** leen el `monthly_rate` actual del montacargas al momento de generación (`mem://logic/recurring-billing-pricing`).
- **Cancelación de reserva**: si no quedan reservas activas para el equipo, su estado vuelve a `available` en la misma transacción (`mem://logic/booking-cancellation`).
- **Cliente genérico “Público en General”** debe reasignarse antes de convertir una cotización (`mem://logic/quote-conversion-constraints`).
- **Gastos de software y depreciación** se excluyen de UI de gastos operativos y del P&L (`mem://features/operating-expenses`).

---

## 14. Migraciones de base de datos

- Ubicaciones: `supabase/migrations/` con formato `<timestamp>_<slug>.sql` (historial previo) y `drizzle/migrations/` con formato `00NN_<slug>.sql` (gestionadas con `drizzle-kit`, esquema en `drizzle/schema.ts`, config en `drizzle.config.ts`). Las migraciones multi-organización viven en `drizzle/migrations/`.
- Política:
  - **Una migración por cambio funcional**, atómica.
  - **Nunca editar** migraciones ya aplicadas; corregir con una nueva.
  - **Nunca tocar** schemas reservados: `auth`, `storage`, `realtime`, `supabase_functions`, `vault`.
  - Validaciones temporales → **triggers**, no `CHECK` con funciones no inmutables.
  - RPCs siempre con `SECURITY DEFINER` y `SET search_path = public`.
  - RLS habilitada para toda tabla nueva, con policies basadas en `has_role()`.
- Los tipos de TS se regeneran automáticamente en `src/integrations/supabase/types.ts` — no editar a mano.

---

## 15. Testing

### 15.1 Frontend (Vitest)

- Vitest 4 + @testing-library/react sobre **happy-dom** (`vitest.config.ts`); los archivos que requieran jsdom lo declaran con `// @vitest-environment jsdom`. La suite es offline: la config fuerza `TZ=UTC` y credenciales de Supabase de loopback para no tocar el backend real.
- Helpers de test reutilizables en `src/test/helpers/` (`supabaseChain.ts` para encadenar mocks de Supabase, `queryClient.tsx`, `time.ts`) y wrapper de router en `src/test/routerWrapper.tsx`.
- Cobertura de flujos críticos: `bookingFlow`, `invoiceFlow`, `paymentFlow`, `formatCurrency`, `exportCsv`, `invoiceHelpers`, `constants`, `rolePermissions`, `coerce`, `rpc`, `templateUtils`, `activityTranslations`, `contractPlaceholders`, `lineItems`.
- Suites de hooks/libs en `src/**/__tests__/`: `useDebouncedValue`, `useDialogState`, `useListFilters`, `formatCurrency`, `partFormSchema`, `markdown`.
- Comandos: `bun run test` (CI), `bun run test:watch` (desarrollo).

### 15.2 Edge Functions (Deno)

- Convención: `supabase/functions/<name>/index_test.ts` con `Deno.test`.
- Patrón mínimo por función (smoke RC): CORS preflight 200, rechazo sin `Authorization` (401), rechazo con JWT inválido (401 donde aplique).
- Cobertura RC: `reset-user-password`, `delete-user`, `invite-user`, `invite-customer`, `stamp-cfdi`, `cancel-cfdi`, `toggle-user-status`, `parse-csf`. Las pruebas de administración de usuarios e invitación al portal quedan mientras esas funciones Deno sigan presentes en el repositorio; la lógica vigente que consume la app está en las server functions de §6.3.
- Importes: `https://deno.land/std@0.224.0/dotenv/load.ts` y `assert/mod.ts`. SUPABASE_URL desde `.env`.
- Siempre **consumir el body** (`await res.text()`) para evitar leaks de recursos en Deno.
- CI: job `edge-functions` separado del `quality` en `.github/workflows/ci.yml`.

### 15.3 E2E (Playwright)

- Suite en `tests/e2e/` con `playwright.config.ts` en raíz. Documentación operativa: `tests/e2e/README.md`.
- `webServer` levanta `bun run preview` (que es `wrangler dev --port 4173`, sirviendo el build SSR de `dist/`) en el puerto 4173 y corre en chromium. Con `E2E_REUSE_BUILD=1` reutiliza el `dist/` ya construido; si no, corre `bun run build && bun run preview`.
- Auth: project `setup` (`global.setup.ts`) pide la sesión a Supabase por API (`signInWithPassword`), valida que la cuenta sea staff y escribe `tests/e2e/.auth/admin.json`. Si hay credenciales por rol (`E2E_<ROL>_EMAIL/PASSWORD`) también cachea `.auth/<rol>.json`.
- Project `portal` corre sin `storageState` para validar rutas públicas (`/portal/login`).
- Cobertura actual: `full-flow`, `smoke-nav`, `roles-matrix`, `fiscal-actions`, filtros (`filters-invoices`, `filters-quotes`, `daterange-picker`), kanbans (`crm-kanban`, `maintenance-kanban`), portal (`portal`, `portal-statement`), y flujos puntuales (`invoice-payment`, `quote-pdf`, `quote-edit-prefill`, `return-inspection`, `customer-create`, `bank-reconciliation`).
- Comandos: `bun run test:e2e` (CI) y `bun run test:e2e:ui` (debugging local).
- Datos: cada test corre bajo un `e2e_scope` único (`e2e_seed_scenario` + `e2e_teardown`). Nunca hardcodear IDs.
- Convención: cada test < 30s. Timeouts vía `TIMEOUTS` de `fixtures/helpers.ts`, nunca números mágicos. Evitar selectores por copy: usar `data-testid` o `role` + `name`.

### 15.4 Pruebas de RLS contra Postgres local

- Suites SQL en `supabase/tests/rls/` (ver `supabase/tests/rls/README.md`) más los smokes de `supabase/tests/`.
- Corren en el workflow `rls-db-tests.yml` contra un Postgres levantado por la CLI de Supabase.

### 15.5 Mobile QA

- Pasada manual antes de cada minor: viewport 375x812 (iPhone 13) en preview.
- Checklist mínimo: sidebar colapsado, `MobileCardList` en listas, sin overflow horizontal, formularios sin clipping, modales caben.
- No se gatea CI con esto — es proceso humano y el resultado se resume en la entrada de changelog correspondiente.

### 15.6 Workflows de CI

Workflows vigentes en `.github/workflows/`: `ci.yml` (ESLint, `tsc`, `arch-check`, build, un **smoke de arranque** con `playwright.smoke.config.ts` —no la suite E2E completa—, Vitest en 2 shards + merge de resultados/cobertura, y jobs condicionales por archivos tocados: Deno fmt/lint/tests, lint de migraciones SQL, dependency-review y actionlint), `codeql.yml`, `gitleaks.yml`, `rls-db-tests.yml` y `prod-smoke.yml`. `ci.yml` no ejecuta knip. La suite E2E completa (`playwright.config.ts`) corre fuera de `ci.yml`. No hay workflow de Lighthouse.



---


## 16. Versionado y changelog

- Versionado semántico (MAJOR.MINOR.PATCH).
- **Fuente consumida en runtime**: `public/changelog.json` — lo lee `ChangelogPage` vía `fetchChangelog()` en `src/features/changelog/lib/changelog.ts`.
- **Política mandatoria**: cada cambio funcional agrega una entrada al **inicio** del array (versión, fecha, tipo, título, descripción, lista de cambios). Selecciona major/minor/patch según magnitud.
- La página `/changelog` permite filtrar por tipo.

---

## 17. Cómo evolucionar la arquitectura

**Añadir un nuevo módulo** (feature slice):
1. Crear carpeta `src/features/<feature>/` con sub-carpetas `pages/`, `components/`, `hooks/`, `lib/`.
2. Página orquestadora en `src/features/<feature>/pages/<Feature>Page.tsx`.
3. Hook(s) de dominio en `src/features/<feature>/hooks/use<Feature>.ts` con TanStack Query. Si supera 80 LOC, divide en `*Query.ts` + `*Mutations.ts`.
4. Componentes UI en `src/features/<feature>/components/`. Helpers puros en `src/features/<feature>/lib/` con sufijo `*Helpers.ts`.
5. Crear el archivo de ruta en `src/routes/_main/<ruta>.tsx` (el nombre del archivo define la URL): `lazy` de la página, `module`/`minAccess` locales y `RoleGuard`, siguiendo el patrón de `invoices.index.tsx`. Agregar la URL a `src/app-routes/routes.ts`.
6. Si el módulo debe aparecer en el sidebar o en la búsqueda global, registrarlo también en `src/app-routes/routes-config.tsx`.
7. Insertar el módulo en `role_permissions` (migración) y en la constante `MODULES` de `src/features/users/hooks/useRolePermissions.ts`. Mapear ruta → módulo en `ROUTE_TO_MODULE`.

8. Agregar test mínimo en `src/test/`.
9. Agregar entrada al inicio de `public/changelog.json` **y** crear el detalle en `public/changelog/v<X.Y.Z>.json`.

**Cuándo extraer**:
- **Hook** si hay estado/efectos compartidos o lógica > 30 líneas en un componente.
- **Componente hijo** si hay un bloque JSX > 60 líneas o reutilizable.
- **RPC de Postgres** si una operación toca ≥ 2 tablas o requiere atomicidad/seguridad elevada.
- **Edge Function** si necesitas: secretos, llamadas a terceros, lógica con privilegios de servicio, jobs programados.

**Anti-patrones a evitar**:
- Editar `src/integrations/supabase/{client,types}.ts`, `src/routeTree.gen.ts` o `.env` (autogenerados).
- Lógica de Supabase dentro de componentes.
- Roles guardados en `profiles` o en `localStorage`.
- Colores literales fuera de los tokens del design system.
- `CHECK` constraints con `now()` u otras funciones no inmutables.
- `any`, `!`, `as` casuales.
- `alert()` o `confirm()` nativos — usar diálogos shadcn (`AlertDialog`, `Dialog`).
- `console.log` en código de producción — usar `sonner` para feedback al usuario.
- FK directa a `auth.users` — referenciar `user_id` y modelar perfiles en `profiles`.
- Re-montar `MainLayout` por ruta o duplicar layouts — el layout vive en la ruta `_main`; `Suspense` va por página.
- Mostrar al usuario términos como “Supabase dashboard” — referirse a **Lovable Cloud**.
- Reimplementar funcionalidad ya cubierta por una dependencia del stack canónico (ver §20.4).

---

## 18. Principios de desarrollo (Power of 10, calibrados)

Inspirado en las "Power of 10 Rules" de la NASA, adaptado al contexto de un ERP React + Supabase. Aplica a **código nuevo o tocado**; no obliga a refactorear retroactivamente.

| # | Regla | Cómo se aplica en LiftGo | Enforcement |
|---|---|---|---|
| 1 | **Flujo de control simple** | Early returns para `loading`/`error` antes del JSX principal. Sin ternarios anidados >2 niveles. | ESLint `complexity ≤ 12` (warn). |
| 2 | **Límites fijos en datos** | Toda query con paginación: server-side (`.limit()` ≤ 500) **o** client-side documentada vía `usePagination` (25/página). Nunca renderizar listas ilimitadas. | Revisión IA. |
| 3 | **Sin fugas de memoria** | Todo `useEffect` con suscripción Supabase Realtime, `setInterval` o listener **debe** retornar cleanup. | ESLint `react-hooks/exhaustive-deps: error`. |
| 4 | **Micro-componentes** | Componentes ≤ **150 LOC**, hooks ≤ **80 LOC**. Si crece: extraer subcomponente o hook. | ESLint `max-lines-per-function: 150` (warn). |
| 5 | **Verificaciones densas** | Tipos generados de Supabase. `if (!data) return …` antes de renderizar. `ErrorBoundary` en rutas. Validación con Zod en formularios. | ESLint `no-non-null-assertion: error`. |
| 6 | **Estado local primero** | `useState` por defecto. Elevar solo si hermanos lo comparten. Context solo para concerns transversales (Auth). | Revisión IA. |
| 7 | **Manejo exhaustivo de APIs** | Toda llamada Supabase verifica `error` y notifica al usuario vía `sonner`. Nunca asumir éxito silencioso. | Revisión IA. |
| 8 | **Herramientas estándar / dependencias antes que código propio** | Preferir dependencias públicas maduras sobre helpers internos o snippets generados por IA. Ver **§20**. Solo Vite + Tailwind estándar; sin macros ni scripts de build no estándar. | Revisión IA. |
| 9 | **Cero prop drilling** | Máximo **3 niveles** de props. Si va más profundo: composición (`children`), Context, o restructurar. | Revisión IA. |
| 10 | **Compilación impecable** | Cero warnings en consola. Cero errores TS. Prohibido `any` para silenciar errores. | ESLint `no-explicit-any: error`, `no-console: warn`. |

**Excepciones documentadas:**
- Tests (`**/*.test.{ts,tsx}`, `src/test/**`) están exentos de `no-explicit-any` y `max-lines-per-function`.
- Archivos generados (`src/integrations/supabase/types.ts`, `src/components/ui/**`) están en `ignores`.
- `console.warn` y `console.error` permitidos para diagnósticos legítimos.

---

## 19. Convenciones de código por feature

### Domain Hooks
Los hooks específicos de un dominio viven en `src/features/<feature>/hooks/`. `src/hooks/` se reserva para hooks **verdaderamente compartidos** entre múltiples features (p.ej. `useDocuments`, `useRolePermissions`). Si un hook es importado mayoritariamente por una sola feature, debe vivir dentro de ella.

Ejemplos correctos:
- `src/features/crm/hooks/useProspects.ts`
- `src/features/invoices/hooks/usePayments.ts`
- `src/features/help/hooks/useUserManual.ts`

Cuando un hook supera ~80 LOC, divídelo en `<entity>Query.ts` + `<entity>Mutations.ts` y deja el archivo original como barril que re-exporta ambos (patrón usado en `useForklifts`, `useBookings`, `useProspects`, `usePaymentIntents`, `useCreditNotes`, `useAssignForklifts`, `useBankReconciliationMutations`).

### Nomenclatura de `lib/`
- `*Helpers.ts` — funciones puras, sin efectos secundarios (`deliveryDetailHelpers.ts`).
- `*Builder.ts` — generadores con efectos colaterales (creación de PDF, side effects): `contractPdfBuilder.ts`.
- **Dominio monetario y de renta** vive en `src/lib/domain/invoiceTotals.ts` (totales, descuentos, IVA) y `src/lib/domain/rentalCalculation.ts` (renta diaria/semanal/mensual). El antiguo `invoiceHelpers.ts` se conserva como barril de compatibilidad.
- **Saldo de facturas**: fuente única en la vista SQL `v_invoices_with_balance` y el hook `useInvoicesWithBalance`. Nunca recalcular `balance = total − Σ pagos` ad-hoc; consumir la vista/hook.

No usar el sufijo `*Utils.ts` en código nuevo.

### Límites de tamaño (Power of 10 aplicado)

- **Componentes React: ≤150 LOC.** Si excede, extrae sub-componentes por responsabilidad (toolbar, fields, dialogs) al mismo directorio.
- **Hooks: ≤80 LOC.** Si excede, divide en `*Query` + `*Mutations` o extrae helpers puros a un archivo hermano (`*Builders.ts`, `*Validation.ts`, `*Payload.ts`).
- **Archivos en `lib/`: sin tope estricto** mientras cada función pública sea ≤40 LOC y de responsabilidad única.

**Excepciones permitidas** (no requieren división):
1. Tablas densas read-only con muchas columnas (UI plana sin lógica).
2. Generadores de PDF (`src/lib/pdf/**`) donde la coherencia visual exige mantener el flujo en un único archivo.
3. Componentes shadcn upstream (`src/components/ui/**`) — no se tocan para preservar compatibilidad con actualizaciones.
4. Archivos de tipos puros o constantes sin lógica ejecutable.

Toda excepción debe ser justificable por una de las cuatro razones anteriores. En PR, prefiere dividir antes que excepcionar.

---

## 20. Dependencias antes que código propio

LiftGo prefiere **librerías públicas maduras** sobre helpers internos o snippets generados por IA. Este principio es de primera clase: complementa la regla #8 de Power of 10 (§18) y rige cada PR.

### 20.1 Principio

- Las dependencias públicas tienen tests upstream, ecosistema de issues, documentación y mantenimiento compartido.
- El código generado por IA es **punto de partida**, nunca sustituto de una librería probada.
- Cada "utility" propia que reimplementa algo que ya existe en npm es deuda: superficie de bugs, sin tests upstream, fricción de onboarding.
- Caso de referencia: migración de jsPDF imperativo (dibujo X/Y manual, helpers internos) a `@react-pdf/renderer` declarativo en `v6.6.0-alpha.1`.

### 20.2 Criterios para adoptar una dependencia (checklist)

- Mantenimiento activo (último release < 12 meses, issues atendidos).
- Tipos TS oficiales o `@types/*` de calidad.
- Tamaño razonable (medir con bundlephobia; carga diferida vía `lazy()` si > 50 KB gzip).
- Licencia permisiva (MIT / Apache-2.0 / ISC / BSD).
- Sin vulnerabilidades altas/críticas abiertas.
- Ecosistema: usada por React / Vite / shadcn mainstream cuando aplica.

### 20.3 Cuándo sí escribir código propio

Solo cuando se cumple **al menos uno**:

- Regla de negocio específica de LiftGo (numeración de documentos, MRR, buffer GiST, RLS).
- La dependencia disponible es 10× más pesada que el problema.
- Requisito de seguridad que exige RPC en Postgres, no cliente.
- Glue muy delgado (< 30 LOC) entre dos librerías ya adoptadas.

### 20.4 Stack canónico (qué usar — no reinventar)

| Necesidad | Usar | NO reimplementar |
|---|---|---|
| Fechas / zonas horarias | `date-fns` + `date-fns-tz` (vía `nowMty`) | Aritmética manual con `Date` |
| Validación | `zod` | Validadores ad-hoc |
| Formularios | `react-hook-form` + `@hookform/resolvers` | Estado manual con `useState` para forms complejos |
| Estado servidor | `@tanstack/react-query` | `useEffect` + `fetch` |
| Tablas | `@tanstack/react-table` (vía `DataTableV2`) | Lógica de sort/filter/paginate manual |
| UI primitives | `shadcn/ui` sobre Radix | Componentes accesibles desde cero |
| Iconos | `lucide-react` | SVGs inline duplicados |
| PDF | `@react-pdf/renderer` | jsPDF imperativo / dibujo X-Y |
| Cálculos monetarios | `currency.js` | Aritmética flotante directa |
| CSV | `papaparse` (vía `exportCsv.ts`) | Concatenación manual de strings |
| Toasts | `sonner` | `alert()` / banners propios |
| Drag & drop archivos | `react-dropzone` | Listeners HTML5 manuales |
| Markdown | `marked` + `dompurify` (vía `features/help/lib/markdown.ts`) | Regex / parsers propios |
| Class merging | `clsx` + `tailwind-merge` (vía `cn`) | Concatenación de strings |
| Animaciones | `tw-animate-css` (importado en `src/styles.css`) | `setTimeout` + clases |
| Testing | `vitest` + `@testing-library/react` | Asserts manuales |
| Descargas blob | `src/lib/pdf/renderAndSave.tsx` | `URL.createObjectURL` + `link.click` ad-hoc duplicado |
| Captura screenshot DOM | `html-to-image` (lazy, solo feedback) | Re-render manual a canvas |


### 20.5 Proceso para introducir una dependencia nueva

1. Verificar que no exista ya algo equivalente en el stack canónico (§20.4).
2. Aplicar checklist §20.2.
3. Instalar con `bun add`; añadir nota al changelog (`type: refactor` o `feature`).
4. Si pasa a ser canónica, documentarla en §2 (Stack tecnológico) y en §20.4.
5. Si reemplaza código propio: **eliminar el archivo legacy en el mismo PR** (no dejar código muerto).

### 20.6 Proceso para retirar código generado / hand-rolled

- Cuando un helper interno duplica una librería canónica → marcarlo `@deprecated` con `// TODO(deps): migrar a <lib>` y abrir entrada de changelog.
- Migración **incremental**: features nuevas usan la dependencia; el legacy se migra cuando se toca por otra razón.
- Migraciones grandes (jsPDF → react-pdf, cálculos → currency.js) se hacen como olas dedicadas y se registran como `major` o `minor` con resumen en `public/changelog/v<X.Y.Z>.json`.
- **Estado actual del stack canónico**: §20.4 de este documento es la fuente de verdad; `package.json` refleja las versiones vigentes.

### 20.7 Anti-patrones

- "Lo escribo yo, así sé qué hace" — más mantenimiento, sin tests upstream.
- Copiar un snippet de IA que reimplementa algo de `date-fns` / `zod` / `tanstack` / `currency.js`.
- Wrappers triviales sobre una librería que solo renombran su API.
- Forks internos de librerías sin razón documentada.
- Dependencias one-off que duplican algo del stack canónico.

### 20.8 Dependencias de un solo punto de uso (auditoría YAGNI)

Estas librerías tienen **un único consumidor** en el repo. No son deuda: cada una encapsula un problema con casos borde que no vale la pena reimplementar. Se documentan aquí para que una futura auditoría no las elimine por "poco usadas".

| Dependencia | Único consumidor | Por qué se conserva |
|---|---|---|
| `marked` | `src/features/help/lib/markdown.ts` | Parser CommonMark completo para los artículos de ayuda; un regex propio rompe en tablas, listas anidadas y código. |
| `dompurify` | `src/features/help/lib/markdown.ts` | Sanitiza el HTML resultante antes de inyectarlo. Requisito de seguridad: **nunca** sustituir por escapado manual. |
| `papaparse` | `src/lib/exportCsv.ts` | Serialización CSV con comillas, separadores y saltos de línea dentro de celdas; el helper manual anterior corrompía datos con comas. |
| `html-to-image` | `src/features/feedback/lib/captureScreenshot.ts` | Captura DOM → PNG solo en el widget de feedback; import diferido, no entra al bundle principal. |

Regla: si el único consumidor desaparece, **la dependencia se elimina en el mismo PR**.


---

## 21. Contratos cross-feature

Para evitar el acoplamiento "feature A importa hooks internos de feature B sólo para reutilizar un tipo", los tipos de dominio compartidos viven en **`src/types/rental.ts`** (`Booking`, `Forklift`, `Quote`, `BookingWithForklift`, `ContractViewModel`, `ReturnInspectionWithJoins`, `DamageRecordWithJoins`, ...), sobre las filas crudas de `@/integrations/supabase/types`. Los helpers de dominio realmente cross-feature viven en `src/lib/domain/` (ver `src/lib/domain/README.md`).

**Regla**: si una feature necesita *solo el tipo* de otra (sin invocar su hook), importarlo desde `@/types/rental` o del barrel público de la feature dueña (`@/features/x`). Si necesita los datos, sigue invocando el hook público de la feature dueña (p. ej. `useCustomers`, `useForklifts`). Nunca importar archivos internos (`@/features/X/hooks/*/...`) desde otra feature.


Beneficio: las features siguen siendo dueñas de su I/O, pero los contratos públicos son estables y descubribles.

---

## 22. Convenciones de naming (estándar)

Naming consistente reduce fricción cognitiva, mejora la búsqueda por nombre y facilita el onboarding. Esta sección es **normativa**: el código nuevo debe cumplirla; el código existente se alinea cuando se toca por otra razón (migración incremental, igual que §20.6).

### 22.1 Carpetas

| Caso | Convención | Ejemplo válido | Ejemplo a evitar |
|---|---|---|---|
| Carpetas generales (`src/components/`, `src/lib/`, sub-carpetas) | **kebab-case** | `src/components/data-table/`, `src/lib/pdf/contract/` | `dataTable/`, `pdfContract/` |
| Features (`src/features/<feature>/`) | **kebab-case**; mantener plural ya establecido (`bookings`, `invoices`, `quotes`) | `src/features/accounts-payable/`, `src/features/bookings/` | `src/features/AccountsPayable/`, `src/features/booking_management/` |
| Sub-carpetas dentro de una feature | **kebab-case** salvo `pages/`, `components/`, `hooks/`, `lib/` (estándar) | `src/features/invoices/components/invoice-form/` | `src/features/invoices/components/InvoiceForm/` |
| Carpeta de tests co-localizados | `__tests__/` (convención Vitest/Jest) | `src/lib/domain/__tests__/` | `src/lib/domain/tests/` |

### 22.2 Archivos

| Tipo | Convención | Ejemplo válido | Ejemplo a evitar |
|---|---|---|---|
| **Componente React** (`.tsx` que exporta un componente) | **PascalCase**, nombre = componente exportado | `BookingActions.tsx`, `MobileCardList.tsx` | `bookingActions.tsx`, `mobile-card-list.tsx` |
| **Página** (orquestador de ruta en `pages/`) | **PascalCase** con sufijo `Page` obligatorio | `BookingsPage.tsx`, `InvoiceDetailPage.tsx`, `FleetPage.tsx` | `Bookings.tsx`, `Fleet.tsx`, `invoice-detail.tsx` |
| **Hook** (`.ts`/`.tsx` que exporta `useXxx`) | **camelCase**, prefijo `use` obligatorio | `useBookings.ts`, `useDebouncedValue.ts`, `useIsMobile.ts` | `use-mobile.tsx`, `UseBookings.ts`, `bookingsHook.ts` |
| **Helper puro** en `lib/` | **camelCase** con sufijo `Helpers.ts` | `invoiceHelpers.ts`, `deliveryDetailHelpers.ts` | `invoice-helpers.ts`, `InvoiceUtils.ts` |
| **Builder con side effects** en `lib/` | **camelCase** con sufijo `Builder.ts` | `contractPdfBuilder.ts`, `quoteLineItemsBuilder.ts` | `buildContract.ts`, `contract_builder.ts` |
| **Tipos/interfaces** puros | **camelCase** con sufijo `Types.ts` | `customerTypes.ts`, `contractTypes.ts` | `Types.ts`, `customer.types.ts` |
| **Constantes** | `constants.ts` por scope, o `<dominio>Constants.ts` | `lib/constants.ts`, `domainConstants.ts` | `Constants.ts`, `CONSTANTS.ts` |
| **Test** | mismo nombre del archivo bajo prueba + `.test.ts(x)`, co-localizado en `__tests__/` | `formatCurrency.test.ts`, `BookingActions.test.tsx` | `test-format-currency.ts`, `BookingActionsSpec.tsx` |
| **Edge Function** | carpeta y archivo en **kebab-case**: `index.ts` + `handler.ts` + `index_test.ts` | `supabase/functions/stamp-cfdi/handler.ts` | `stampCfdi/`, `StampCFDI/` |
| **Migración SQL** | `<timestamp>_<slug-en-snake_case>.sql` | `20260614120000_add_invoice_balance_view.sql` | `add-invoice-balance.sql` |
| **Sufijos prohibidos** en archivos nuevos | — | — | `*Utils.ts`, `*Manager.ts`, `*Helper.ts` (singular), `*Service.ts` |

> **Excepciones permitidas (legacy con costo de migración alto)**: `src/components/ui/**` (primitivos shadcn upstream, mantienen kebab-case porque vienen así del generador), `src/integrations/supabase/**` (autogenerado).

### 22.3 Símbolos en código

| Tipo | Convención | Ejemplo |
|---|---|---|
| Componentes React | **PascalCase** | `BookingActions`, `MobileCardList` |
| Hooks | **camelCase**, prefijo `use` | `useBookings`, `useDebouncedValue` |
| Variables y funciones | **camelCase** | `formatCurrency`, `pendingInvoices` |
| Booleanos | prefijo `is/has/can/should` | `isLoading`, `hasError`, `canEdit` |
| Handlers internos | prefijo `handle` | `handleSubmit`, `handleRowClick` |
| Props de callback | prefijo `on` | `onChange`, `onRowClick`, `onSuccess` |
| Constantes globales inmutables | **SCREAMING_SNAKE_CASE** | `MODULES`, `ROUTE_TO_MODULE`, `VAT_RATES` |
| Types e interfaces | **PascalCase** | `Booking`, `InvoiceRow`, `ProspectInsert` |
| Enums | **PascalCase**; valores en `snake_case` si vienen de Postgres | `enum AppRole { admin, ventas }` |
| RPCs / funciones SQL | **snake_case** | `generate_invoice_number`, `has_role` |
| Tablas y columnas SQL | **snake_case**, tablas en plural | `user_roles`, `monthly_rate`, `created_at` |

### 22.4 Rutas y URLs

| Caso | Convención | Ejemplo |
|---|---|---|
| Path de ruta | **kebab-case** plural para colecciones | `/bookings`, `/income-statement`, `/mis-reportes` |
| Parámetros de ruta | **camelCase** | `/invoices/:invoiceId` |
| Query params | preferir **snake_case** para alinear con SQL | `?customer_id=...&date_from=...` |
| Constantes de ruta (`ROUTES`) | **camelCase** anidado | `ROUTES.invoices.detail(id)` |

### 22.5 Identificadores de documento

Generados por RPCs `generate_*_number`; prefijos **en español** en mayúsculas, separador `-`, secuencia con padding:

`FAC-0001` (factura) · `COT-0001` (cotización) · `CTR-0001` (contrato) · `RSV-0001` (reserva) · `ENT-0001` (entrega) · `DEV-0001` (devolución) · `NC-0001` (nota de crédito) · `CP-0001` (complemento de pago).

### 22.6 Anti-patrones a evitar

- Mezclar `<Name>.tsx` y `<Name>Page.tsx` para páginas (debe ser siempre con sufijo `Page`).
- `use-mobile.tsx` y similares en kebab-case para hooks (debe ser camelCase).
- Sufijos genéricos `*Utils.ts`, `*Manager.ts`, `*Service.ts`, `*Helper.ts` (singular).
- Carpetas en camelCase como `dataTable/`, `pdfContract/`.
- Importar `from "@/features/x/hooks/internal/..."` cruzando features — usar la API pública del barrel (`@/features/x`).
- Booleanos sin prefijo (`loading` → `isLoading`, `error` → `hasError`).
- Constantes globales inmutables en `lowercase` (`vatRates` → `VAT_RATES`).
- Renombrar al importar (`import { X as Y }`) salvo colisión real de nombres.

### 22.7 Migración del naming existente

El audit v6.70.x detectó estas inconsistencias. **No se renombran en bloque** (cada rename rompe imports e historial de diffs); se alinean cuando el archivo se toca por otra razón, registrando el rename en el changelog del cambio que lo motivó:

- `src/components/dataTable/` → `src/components/data-table/`.

- `src/hooks/use-mobile.tsx` → `useIsMobile.tsx` (alinear con su export).
- Tests de flujo en `src/test/<feature>Flow.test.ts` → mover a `src/features/<feature>/__tests__/`.

Todo código nuevo o renombrado debe cumplir §22.1–§22.4 sin excepciones (más allá de las listadas en §22.2).

---

## 23. Deuda técnica priorizada (post-audit v6.70.x)

Items identificados por la auditoría arquitectónica que **no se ejecutaron** en la Fase A (v6.71.0) por requerir diseño previo. Quedan registrados aquí como deuda explícita; cada uno debe abordarse con su propio PR scoped + RFC corto, **no en un refactor masivo**.

### 23.1 Pipeline CFDI compartido (Edge Functions) — Prioridad ALTA

**Alcance:** `supabase/functions/{download-cfdi, validate-supplier-rep, stamp-payment-complement, stamp-cfdi}` suman ~1,400 LOC con duplicación en auth, fetch a Facturapi, mapping de errores y manejo de PAC.

**Por qué no se hizo ahora:** sin distinguir lo genuinamente común (auth/CORS/error mapping) de lo específico por tipo de comprobante (ingreso vs. pago vs. cancelación), una extracción prematura empeora la legibilidad. Además requiere suite E2E contra Facturapi sandbox antes de tocarlo (un bug acá rompe timbrado en producción).

**Trigger natural:** al agregar un nuevo tipo de CFDI (ej. nómina, traslado) o cambiar de PAC. Diseño esperado: `supabase/functions/_shared/cfdi/{auth.ts, facturapi-client.ts, errors.ts, types.ts}`.

### 23.2 Capa `data-access` por entidad — Prioridad MEDIA

**Alcance:** ~40 hooks en `src/features/*/hooks/` mezclan queries Supabase con lógica de TanStack Query y transformación.

**Por qué no se hizo ahora:** tocar 40 archivos en un solo PR es exactamente el anti-patrón que Power of 10 prohíbe. Sin patrón consensuado (¿clase repository? ¿módulo de funciones puras? ¿generador desde tipos?), la migración inicial se vuelve incoherente.

**Trigger natural:** al añadir una entidad nueva, implementarla con la capa `data-access` y migrar entidades existentes una por release. Diseño esperado: `src/features/<entity>/data/{queries.ts, mutations.ts}` consumido por hooks delgados.

### 23.3 Sidebar de shadcn ya dividido — CERRADO

El primitive vive en `src/components/ui/sidebar/` (`Sidebar.tsx`, `SidebarGroup.tsx`, `SidebarMenu.tsx`, `SidebarMenuSub.tsx`, `SidebarSections.tsx`, `context.tsx`, `variants.ts`, `constants.ts`, `index.ts`). Al estar fuera del archivo único de shadcn, una futura actualización upstream (`shadcn add sidebar`) debe reconciliarse a mano.


### 23.4 Política general para esta deuda

- Cada item se aborda **solo con caso de negocio concreto** (no por estética).
- PR scoped + tests + entrada en changelog.
- Si un item permanece >12 meses sin trigger natural, reevaluar si sigue siendo deuda real o decisión de diseño aceptada.

---

## 24. Referencias

- `README.md` — instrucciones de desarrollo.
- `public/changelog.json` — historial funcional consumido por la app.
- `src/features/changelog/lib/changelog.ts` — fetcher + tipos del changelog.
- `src/lib/constants.ts` — constantes de dominio (estados, etiquetas, colores).
- `src/lib/config.ts` — configuración global (IVA, monedas).
- `src/app-routes/routes-config.tsx` y `src/app-routes/routes.ts` — registro heredado (sidebar/búsqueda) y constantes de URL; los permisos efectivos viven en cada archivo de ruta (`RoleGuard`).
- `src/routes/` — rutas file-based de TanStack Router; `src/routeTree.gen.ts` es generado.
- `src/router.tsx`, `src/start.ts`, `src/server.ts` — router, middlewares y entrada SSR.
- `src/features/users/hooks/useRolePermissions.ts` — `MODULES` y `ROUTE_TO_MODULE`.
- `src/components/dataTable/v2/` — patrón canónico de tablas (DataTableV2 + useLiftgoTable).
- `src/lib/pdf/theme/tokens.ts` — fuente de tokens visuales para PDFs.
- `docs/architecture-guardrails.md` — checks de capas que gatean el merge.
- `docs/paginacion-cursor.md` — patrón de listados y disparador de migración a cursor.
- `supabase/functions/` — Edge Functions Deno.
- `supabase/migrations/` y `drizzle/migrations/` — historial SQL.
- `vite.config.ts` y `wrangler.jsonc` — build SSR (Nitro/Cloudflare) y despliegue.

- `CHANGELOG.md` y `public/changelog/` — historial de cambios (incluye el detalle de cada auditoría cerrada).
