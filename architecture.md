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
| UI | React 18, Vite 5, TypeScript 5, Tailwind CSS v3 |
| Componentes | shadcn/ui sobre Radix UI, lucide-react |
| Estado servidor | TanStack Query v5 |
| Formularios | react-hook-form + Zod |
| Routing | react-router-dom v6 con `lazy()` + `Suspense` |
| Backend | Lovable Cloud (Supabase): Postgres + Auth + Storage + Edge Functions (Deno) |
| Documentos | `@react-pdf/renderer` ^4.5.x (declarativo, JSX → PDF, carga diferida) |
| Notificaciones | sonner |
| Tests | Vitest + @testing-library/react + jsdom |
| Integraciones externas | Facturapi (CFDI 4.0), Lovable AI Gateway |

---

## 3. Diagrama de alto nivel

```text
┌─────────────────────────────────────────────────────────────┐
│                      Navegador (SPA)                        │
│  React + TanStack Query + react-router + shadcn/Radix       │
└──────────────┬──────────────────────────────┬───────────────┘
               │ HTTPS                        │ HTTPS
               ▼                              ▼
      ┌─────────────────┐          ┌──────────────────────┐
      │  Supabase Auth  │          │   Edge Functions     │
      │  (JWT + RLS)    │          │   (Deno, getClaims)  │
      └────────┬────────┘          └──────┬───────────────┘
               │                          │
               ▼                          ▼
      ┌────────────────────────────────────────────┐
      │          Postgres (RLS por rol)            │
      │  has_role() SECURITY DEFINER · RPCs        │
      │  triggers de auditoría · constraints GiST  │
      └────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │  Servicios externos          │
              │  Facturapi · Lovable AI      │
              └──────────────────────────────┘
```

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
├── hooks/                          Hooks transversales (useListPage, usePagination, ...)
├── contexts/                       AuthContext (sesión global)
├── layouts/                        MainLayout, CustomerPortalLayout, AuthGuard, RoleGuard
├── lib/
│   ├── pdf/                        Generación modular de documentos
│   ├── forms/                      Mapeo formulario → payload (coerce, payloads compartidos)
│   ├── domain/                     Helpers de dominio cross-feature (invoiceHelpers, satCatalogs)
│   ├── constants.ts                Etiquetas, colores, estados de dominio
│   ├── config.ts                   Configuración global (tasas IVA, monedas)
│   ├── routes.ts                   Constantes de rutas (`ROUTES.invoices.detail(id)`)
│   ├── routes-config.tsx           Registro central de rutas + módulo (lazy)
│   └── formatCurrency.ts · utils.ts · rpc.ts · telemetry.ts · ...
├── integrations/supabase/          Cliente y types AUTOGENERADOS — no editar
├── types/                          Tipos de dominio compartidos (rental.ts, ...)
├── test/                           Tests + helpers/mocks de Supabase
├── App.tsx                         Composición de providers, guards y router
└── main.tsx
supabase/
├── functions/                      Edge Functions (CFDI, invitaciones, jobs)
├── migrations/                     Migraciones SQL (timestamp + slug)
└── config.toml                     Configuración de funciones (verify_jwt, etc.)
public/
├── changelog.json                  Índice del historial funcional (ver §16)
└── changelog/v<X.Y.Z>.json         Detalle por versión
```

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
- Bloques composables: `useListFilters`, `useDebouncedValue`, `useSort`, `usePagination`, `useDialogState`. `useFormState` está `@deprecated` (`TODO(deps)` → migrar a `react-hook-form`, ver `docs/dependency-audit.md`).
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
- Constante `MODULES` y mapa `ROUTE_TO_MODULE` definidos en `src/hooks/useRolePermissions.ts` — única fuente de verdad para nombrar módulos en UI y BD.
- Hook `useRolePermissions` carga el mapa con `staleTime: 5 min`.
- Componente `<RoleGuard module="..." minAccess="read">` envuelve cada ruta protegida.
- Cada `appRoute` declara `module` opcional; `App.tsx` lo enlaza a `RoleGuard`.

### 6.3 Edge Functions

- Validan identidad con `getClaims()` (compatible con tokens nuevos y legacy).
- CORS restringido y centralizado en `supabase/functions/_shared/cors.ts`.
- Validación de inputs en `supabase/functions/_shared/validate.ts`.
- Casos de uso: timbrado/cancelación CFDI (`stamp-cfdi`, `cancel-cfdi`), invitaciones (`invite-user`, `invite-customer`, `delete-user`, `reset-user-password`, `toggle-user-status`), generación recurrente (`generate-recurring-invoices`, `generate-recurring-maintenance`), parseo de CSF (`parse-csf`), generación del manual (`generate-manual`), generación de PDF de factura server-side (`generate-invoice-pdf`).
- `verify_jwt` se configura por función en `supabase/config.toml` cuando aplica.

---

## 7. Enrutamiento y autorización

- `src/lib/routes-config.tsx` exporta `appRoutes: RouteConfig[]` con `path`, `component` (lazy) y `module` opcional.
- `src/App.tsx` compone:

  ```text
  AppProviders
    └─ BrowserRouter
         ├─ /portal/*                (portal cliente, layout propio)
         └─ AuthGuard → MainLayout
              └─ appRoutes.map → Suspense → RoleGuard? → Page
  ```

- **Sin nested wildcards**: `MainLayout` se monta una sola vez, `Suspense` envuelve cada ruta individual (ver `mem://arch/routing-architecture`).
- Constantes de URL en `src/lib/routes.ts` (`ROUTES.invoices.detail(id)`) para evitar strings mágicos.
- Rutas notables fuera de los CRUD: `/income-statement`, `/mrr`, `/expenses` (operativos), `/audit`, `/activity`, `/role-permissions`, `/operations-setup`, `/changelog`, `/help`, `/feedback` (admin Kanban), `/mis-reportes`, `/leaderboard`.

---

## 8. Portal de cliente

- Aislado bajo `/portal/*` con `CustomerPortalLayout` y autenticación independiente (`/portal/login`).
- Páginas: `PortalDashboard`, `PortalRentals`, `PortalInvoices`, `PortalInvoiceDetail`, `PortalContracts`.
- Hooks dedicados (`useCustomerPortal`, `usePortalInvoices`, `usePortalBookings`) que **nunca** comparten queries con el backoffice.
- Modelo de seguridad: usuarios invitados desde la edge function `invite-customer` quedan vinculados a un `customer_id`. Las policies RLS filtran por `customer_id = (auth claims)`. Acceso **solo lectura**.
- Sin acceso a módulos internos (gastos, P&L, mantenimiento, etc.).

---

## 9. Generación de documentos (PDFs)

- Carpeta `src/lib/pdf/` con un sub-módulo por tipo de documento:
  - `contract/` — `contractPage.ts`, `checklistPage.ts`, `pagarePage.ts`, `sections/{header,declarations,clauses,signatures}.ts`, `placeholders.ts`, `placeholderRegistry.ts`, `data-templates.ts`, `fetchers.ts`.
  - `quote/` — `header.ts`, `table.ts`, `totals.ts`, `constants.ts` (**fuente de tokens compartidos**: `GRAY_*`, `FONT_*`, `MARGIN`).
  - `customerStatement/` — `parts.ts`, `tables.ts`.
  - `incomeStatement/` — `header.ts`, `rows.ts` (consume tokens de `quote/constants.ts`).
- `placeholderRegistry.ts` es la **única fuente de verdad** para tokens de plantillas de contrato (consumido por el editor y por el generador).
- Helpers compartidos en `shared.ts` (fetch de datos de empresa + logo, wrappers de texto, paginación) y `loadImageAsBase64.ts`.
- jsPDF se carga de forma diferida desde el botón que dispara la descarga; bloqueado en versión ≤ 4.0.0 por compatibilidad (`mem://tech/security/vulnerabilities`).
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
- **Tokens semánticos**: nunca colores literales (`text-white`, `bg-black`). Todo color en HSL en `index.css` y `tailwind.config.ts`. Componentes usan tokens (`bg-primary`, `text-muted-foreground`, etc.).

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

- Ubicación: `supabase/migrations/` con formato `<timestamp>_<slug>.sql`.
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

- Vitest + jsdom + @testing-library/react.
- Mocks de Supabase reutilizables en `src/test/helpers/mockSupabase.ts`.
- Cobertura de flujos críticos: `bookingFlow`, `invoiceFlow`, `paymentFlow`, `formatCurrency`, `exportCsv`, `invoiceHelpers`, `constants`, `rolePermissions`.
- Comandos: `bun run test` (CI), `bun run test:watch` (desarrollo).

---

## 16. Versionado y changelog

- Versionado semántico (MAJOR.MINOR.PATCH).
- **Fuente consumida en runtime**: `public/changelog.json` — lo lee `ChangelogPage` vía `fetchChangelog()` en `src/lib/changelog.ts`.
- **Política mandatoria**: cada cambio funcional agrega una entrada al **inicio** del array (versión, fecha, tipo, título, descripción, lista de cambios). Selecciona major/minor/patch según magnitud.
- La página `/changelog` permite filtrar por tipo.

---

## 17. Cómo evolucionar la arquitectura

**Añadir un nuevo módulo** (feature slice):
1. Crear carpeta `src/features/<feature>/` con sub-carpetas `pages/`, `components/`, `hooks/`, `lib/`.
2. Página orquestadora en `src/features/<feature>/pages/<Feature>Page.tsx`.
3. Hook(s) de dominio en `src/features/<feature>/hooks/use<Feature>.ts` con TanStack Query. Si supera 80 LOC, divide en `*Query.ts` + `*Mutations.ts`.
4. Componentes UI en `src/features/<feature>/components/`. Helpers puros en `src/features/<feature>/lib/` con sufijo `*Helpers.ts`.
5. Registrar ruta en `src/lib/routes-config.tsx` con `module: "Mi Módulo"` y `lazy()`.
6. Agregar la URL a `src/lib/routes.ts`.
7. Insertar el módulo en `role_permissions` (migración) y en la constante `MODULES` de `useRolePermissions.ts`. Mapear ruta → módulo en `ROUTE_TO_MODULE`.
8. Agregar test mínimo en `src/test/`.
9. Agregar entrada al inicio de `public/changelog.json` **y** crear el detalle en `public/changelog/v<X.Y.Z>.json`.

**Cuándo extraer**:
- **Hook** si hay estado/efectos compartidos o lógica > 30 líneas en un componente.
- **Componente hijo** si hay un bloque JSX > 60 líneas o reutilizable.
- **RPC de Postgres** si una operación toca ≥ 2 tablas o requiere atomicidad/seguridad elevada.
- **Edge Function** si necesitas: secretos, llamadas a terceros, lógica con privilegios de servicio, jobs programados.

**Anti-patrones a evitar**:
- Editar `src/integrations/supabase/{client,types}.ts` o `.env` (autogenerados).
- Lógica de Supabase dentro de componentes.
- Roles guardados en `profiles` o en `localStorage`.
- Colores literales fuera de los tokens del design system.
- `CHECK` constraints con `now()` u otras funciones no inmutables.
- `any`, `!`, `as` casuales.
- `alert()` o `confirm()` nativos — usar diálogos shadcn (`AlertDialog`, `Dialog`).
- `console.log` en código de producción — usar `sonner` para feedback al usuario.
- FK directa a `auth.users` — referenciar `user_id` y modelar perfiles en `profiles`.
- Nested wildcards en rutas o re-montar `MainLayout` por ruta — usar `Suspense` por ruta.
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

Cuando un hook supera ~80 LOC, divídelo en `<entity>Query.ts` + `<entity>Mutations.ts` y deja el archivo original como barril que re-exporta ambos (patrón usado en `useForklifts`, `useBookings`, `useProspects`).

### Nomenclatura de `lib/`
- `*Helpers.ts` — funciones puras, sin efectos secundarios (`deliveryDetailHelpers.ts`, `invoiceHelpers.ts`).
- `*Builder.ts` — generadores con efectos colaterales (creación de PDF, side effects): `contractPdfBuilder.ts`.

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
| CSV | helper `exportCsv.ts`; escalar a `papaparse` si crece | Concatenación manual de strings |
| Toasts | `sonner` | `alert()` / banners propios |
| Drag & drop archivos | `react-dropzone` | Listeners HTML5 manuales |
| Markdown | `react-markdown` + `remark-gfm` | Regex / parsers propios |
| Class merging | `clsx` + `tailwind-merge` (vía `cn`) | Concatenación de strings |
| Animaciones | `tailwindcss-animate` (+ `framer-motion` puntual) | `setTimeout` + clases |
| Testing | `vitest` + `@testing-library/react` | Asserts manuales |
| Descargas blob | `file-saver` (lazy import) | `URL.createObjectURL` + `link.click` ad-hoc duplicado |
| Captura screenshot DOM | `html2canvas` (lazy import, solo feedback) | Re-render manual a canvas |

### 20.5 Proceso para introducir una dependencia nueva

1. Verificar que no exista ya algo equivalente en el stack canónico (§20.4).
2. Aplicar checklist 21.2.
3. Instalar con `bun add`; añadir nota al changelog (`type: refactor` o `feature`).
4. Si pasa a ser canónica, documentarla en §2 (Stack tecnológico) y en §20.4.
5. Si reemplaza código propio: **eliminar el archivo legacy en el mismo PR** (no dejar código muerto).

### 20.6 Proceso para retirar código generado / hand-rolled

- Cuando un helper interno duplica una librería canónica → marcarlo `@deprecated` con `// TODO(deps): migrar a <lib>` y abrir entrada de changelog.
- Migración **incremental**: features nuevas usan la dependencia; el legacy se migra cuando se toca por otra razón.
- Migraciones grandes (jsPDF → react-pdf, cálculos → currency.js) se hacen como olas dedicadas y se registran como `major` o `minor` con resumen en `public/changelog/v<X.Y.Z>.json`.
- **Estado actual de la auditoría**: ver `docs/dependency-audit.md` (regenerar con `python3 scripts/dependency_audit.py`).

### 20.7 Anti-patrones

- "Lo escribo yo, así sé qué hace" — más mantenimiento, sin tests upstream.
- Copiar un snippet de IA que reimplementa algo de `date-fns` / `zod` / `tanstack` / `currency.js`.
- Wrappers triviales sobre una librería que solo renombran su API.
- Forks internos de librerías sin razón documentada.
- Dependencias one-off que duplican algo del stack canónico.

---

## 21. Referencias

- `README.md` — instrucciones de desarrollo.
- `public/changelog.json` — historial funcional consumido por la app.
- `src/lib/changelog.ts` — fetcher + tipos del changelog.
- `src/lib/constants.ts` — constantes de dominio (estados, etiquetas, colores).
- `src/lib/config.ts` — configuración global (IVA, monedas).
- `src/lib/routes-config.tsx` y `src/lib/routes.ts` — rutas y permisos.
- `src/hooks/useRolePermissions.ts` — `MODULES` y `ROUTE_TO_MODULE`.
- `supabase/functions/` — backend serverless.
- `supabase/migrations/` — historial SQL.
- `.lovable/plan.md` — última auditoría arquitectónica.
