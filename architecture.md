# Arquitectura — LiftGo ERP

> Documento vivo. Actualízalo cuando cambien decisiones estructurales (rutas, capas, integraciones, modelo de seguridad). Para cambios funcionales, usa `public/changelog.json`.

---

## 1. Introducción

LiftGo es un ERP interno para la operación de una empresa de renta y venta de montacargas. Centraliza:

- **Operaciones**: flota, reservas, calendario, entregas, devoluciones, mantenimiento, inventario de refacciones, daños.
- **Comercial**: CRM/prospectos, clientes, cotizaciones (renta y venta), contratos.
- **Finanzas**: facturación CFDI 4.0, pagos, gastos operativos, estado de resultados, MRR, proveedores.
- **Administración**: gestión de usuarios, permisos por rol, configuración de empresa, bitácora de auditoría, ayuda y changelog.
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
| Documentos | jsPDF 4.x + jspdf-autotable (carga diferida) |
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

```text
src/
├── pages/              Orquestadores de ruta (thin containers)
├── components/         UI agrupada por dominio
│   ├── ui/             Primitivas shadcn
│   ├── bookings/       · invoice-detail/ · contracts/ · damage/ ...
│   └── *Shared.tsx     DetailPageHeader, EmptyState, TotalsSummary, ...
├── hooks/              Hooks de dominio (datos + lógica) — granulares
│   ├── bookingDetail/  · contractForm/ · incomeStatement/ ...
│   └── use*.ts         useBookings, useInvoices, useListPage, ...
├── contexts/           AuthContext (sesión global)
├── layouts/            MainLayout, CustomerPortalLayout
├── lib/
│   ├── pdf/            Generación modular de documentos
│   ├── forms/          Mapeo de formularios → payloads de DB
│   ├── constants.ts    Etiquetas, colores, estados de dominio
│   ├── config.ts       Configuración global (tasas IVA, etc.)
│   ├── routes.ts       Constantes de rutas (`ROUTES.invoices.detail(id)`)
│   ├── routes-config.tsx  Registro central de rutas + módulo (lazy)
│   ├── formatCurrency.ts · activityTranslations.ts · utils.ts · changelog.ts
├── integrations/supabase/   Cliente y types AUTOGENERADOS — no editar
├── types/              Tipos de dominio compartidos (rental.ts, ...)
├── test/               Tests + helpers/mocks de Supabase
├── App.tsx             Composición de providers, guards y router
└── main.tsx
supabase/
├── functions/          Edge Functions (CFDI, invitaciones, jobs)
└── config.toml         Configuración de funciones (verify_jwt, etc.)
```

**Reglas de ubicación**:
- Lógica de datos → `hooks/` (nunca dentro de componentes).
- Utilidades puras (sin React) → `lib/`.
- Tipos compartidos entre dominios → `types/`. Tipos locales a un componente viven con el componente.
- Cuando un componente crece > 150 líneas o supera complejidad ciclomática 15, se modulariza extrayendo hook + sub-componentes.

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
- `useListFilters`, `useDebouncedValue`, `useFormState`, `useSort`, `usePagination` como bloques composables.
- `DetailPageHeader`, `FormPageHeader`, `TotalsSummary`, `EmptyState`, `StatusBadge`, `MobileCardList`, `ReadOnlyLineItemsTable` como componentes estándar.

### 5.3 Mutaciones y caché

- Toda mutación invalida o actualiza el caché de TanStack Query (`setQueryData` para optimistic, `invalidateQueries` para consistencia).
- **Optimistic UI** en eliminaciones: navegación inmediata + rollback en `onError`.
- Errores de mutación se reportan con `sonner` (`toast.error/warning`), nunca con `alert` ni `console`.

### 5.4 Integridad transaccional

- Flujos multi-tabla (crear reserva, completar inspección, cancelar reserva) viven como **RPCs de Postgres** (`SECURITY DEFINER`) para garantizar atomicidad.
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
- Roles internos en enum `app_role`: `admin`, `administrativo`, `ventas`, `despachador`, `mecanico`, `auditor`.
- Tabla `user_roles` **separada** de `profiles` para evitar escalada de privilegios.
- Función `public.has_role(_user_id uuid, _role app_role)` `SECURITY DEFINER STABLE SET search_path = public` se usa en todas las policies.

### 6.2 Permisos por módulo

- Tabla `role_permissions` (rol × módulo × `access_level`: `none|read|full`).
- Hook `useRolePermissions` carga el mapa con `staleTime: 5 min`.
- Componente `<RoleGuard module="..." minAccess="read">` envuelve cada ruta protegida en `App.tsx`.
- Mapeo ruta → módulo definido en `routes.tsx` (`appRoutes[].module`) y en `ROUTE_TO_MODULE`.

### 6.3 Edge Functions

- Validan identidad con `getClaims()` (compatible con tokens nuevos y legacy).
- CORS centralizado en `supabase/functions/_shared/cors.ts`.
- Validación de inputs en `_shared/validate.ts`.
- Casos de uso: timbrado/cancelación CFDI, invitar/eliminar usuarios, generación recurrente de facturas y mantenimientos, parseo de CSF, generación de manual.
- `verify_jwt` se configura por función en `supabase/config.toml` cuando aplica.

---

## 7. Enrutamiento y autorización

- `src/routes.tsx` exporta `appRoutes: RouteConfig[]` con `path`, `component` (lazy) y `module` opcional.
- `src/App.tsx` compone:
  ```text
  AppProviders
    └─ BrowserRouter
         ├─ /portal/login            (público)
         └─ AuthGuard → MainLayout
              └─ appRoutes.map → Suspense → RoleGuard? → Page
  ```
- Constantes de URL en `src/lib/routes.ts` (`ROUTES.invoices.detail(id)`) para evitar strings mágicos.
- Portal de cliente totalmente aislado bajo `/portal/*` con su propio layout y hooks (`usePortalInvoices`, `usePortalBookings`).

---

## 8. Generación de documentos (PDFs)

- Carpeta `src/lib/pdf/` con un sub-módulo por tipo de documento:
  - `contract/` — `contractPage.ts`, `checklistPage.ts`, `pagarePage.ts`, `sections/{header,declarations,clauses,signatures}.ts`, `placeholders.ts`, `placeholderRegistry.ts`, `data-templates.ts`, `fetchers.ts`.
  - `quote/` — `header.ts`, `table.ts`, `totals.ts`, `constants.ts`.
  - `customerStatement/`, `incomeStatement/`.
- `placeholderRegistry.ts` es la **única fuente de verdad** para tokens de plantillas de contrato (consumido por el editor y por el generador).
- Helpers compartidos en `shared.ts` y `loadImageAsBase64.ts`.
- jsPDF se carga de forma diferida desde el botón que dispara la descarga.

---

## 9. Convenciones de UI/UX

- **Desktop-first**: alta densidad, atajo global `Ctrl+K`, drill-down en side panels en lugar de columnas de acciones.
- Tablas estandarizadas: compactas, filas zebra, headers sticky, sort/paginación cliente (límite 25).
- Mobile: `MobileCardList` reemplaza tablas complejas.
- Diseño visual “Premium / Industrial Minimalista” para documentos operativos.
- **Tokens semánticos**: nunca colores literales (`text-white`, `bg-black`). Todo color en HSL en `index.css` y `tailwind.config.ts`. Componentes usan tokens (`bg-primary`, `text-muted-foreground`, etc.).

---

## 10. Localización

- Zona horaria fija `America/Monterrey` mediante `nowMty()` en `lib/utils.ts`.
- Fechas: formato DD/MM/YYYY; manipulación con `date-fns` + `date-fns-tz`.
- Moneda MXN por defecto, formato `es-MX` vía `formatCurrency()`.
- Soporte multi-moneda (MXN/USD) en cotizaciones.
- UI 100% en **español mexicano**. Identificadores de documentos con prefijos en español: `FAC-`, `COT-`, `CTR-`, `RSV-`, `ENT-`, `DEV-`.

---

## 11. Testing

- Vitest + jsdom + @testing-library/react.
- Mocks de Supabase reutilizables en `src/test/helpers/mockSupabase.ts`.
- Cobertura de flujos críticos: `bookingFlow`, `invoiceFlow`, `paymentFlow`, `formatCurrency`, `exportCsv`, `invoiceUtils`, `constants`.
- Comandos: `bun run test` (CI), `bun run test:watch` (desarrollo).

---

## 12. Versionado y changelog

- Versionado semántico (MAJOR.MINOR.PATCH) en `public/changelog.json`.
- **Política mandatoria**: cada cambio funcional agrega una entrada al inicio del array (versión, fecha, título, descripción). Selecciona major/minor/patch según magnitud.
- Página `/changelog` consume el JSON.

---

## 13. Cómo evolucionar la arquitectura

**Añadir un nuevo módulo**:
1. Crear página en `src/pages/MyModulePage.tsx` (orquestador).
2. Crear hook(s) de dominio en `src/hooks/useMyModule.ts` con TanStack Query.
3. Componentes UI en `src/components/myModule/`.
4. Registrar ruta en `src/routes.tsx` con `module: "Mi Módulo"`.
5. Agregar la URL a `src/lib/routes.ts`.
6. Insertar el módulo en `role_permissions` (migración) y en la constante `MODULES` de `useRolePermissions.ts`.
7. Agregar test mínimo en `src/test/`.
8. Bump al `changelog.json`.

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

---

## 14. Referencias

- `README.md` — instrucciones de desarrollo.
- `public/changelog.json` — historial de versiones.
- `src/lib/constants.ts` — constantes de dominio (estados, etiquetas, colores).
- `src/lib/config.ts` — configuración global (IVA, etc.).
- `src/routes.tsx` y `src/lib/routes.ts` — rutas y permisos.
- `supabase/functions/` — backend serverless.
- `.lovable/plan.md` — última auditoría arquitectónica.
