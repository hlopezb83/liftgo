# 📐 Plan: Crear `architecture.md`

## Objetivo
Crear un único archivo **`architecture.md`** en la raíz del repositorio que documente la arquitectura de LiftGo ERP siguiendo las mejores prácticas (estructura tipo C4 ligero + ADR-friendly, en **español mexicano**).

## Ubicación
- `architecture.md` (raíz del proyecto, junto a `README.md`)

## Estructura del documento

1. **Introducción**
   - Propósito del sistema (ERP interno LiftGo: flota, reservas, facturación, mantenimiento, CRM).
   - Audiencia del documento (desarrolladores, nuevos integrantes del equipo).
   - Cómo mantener este archivo vivo.

2. **Stack tecnológico**
   - Frontend: React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/Radix.
   - Estado servidor: TanStack Query v5.
   - Formularios: react-hook-form + Zod.
   - Backend: Lovable Cloud (Supabase) — Postgres + Auth + Storage + Edge Functions (Deno).
   - PDFs: jsPDF 4.x + jspdf-autotable (lazy loaded).
   - Tests: Vitest + Testing Library + mocks de Supabase.

3. **Diagrama de alto nivel** (ASCII)
   - Cliente (SPA) ↔ Supabase Auth ↔ Postgres (RLS) ↔ Edge Functions ↔ Servicios externos (Facturapi, Lovable AI Gateway).

4. **Estructura de carpetas** (`src/`)
   - `pages/` — orquestadores de ruta (thin containers).
   - `components/` — UI agrupada por dominio (`bookings/`, `invoice-detail/`, `ui/` shadcn, etc.).
   - `hooks/` — hooks de dominio granulares (TanStack Query + lógica).
   - `lib/` — utilidades puras (`pdf/`, `forms/`, `formatCurrency`, `constants`, `routes`, `utils`).
   - `contexts/` — `AuthContext` global.
   - `layouts/` — `MainLayout`, `CustomerPortalLayout`.
   - `integrations/supabase/` — cliente y types **autogenerados** (no editar).
   - `types/` — tipos de dominio compartidos.
   - `test/` — pruebas e2e ligeras + helpers/mocks.
   - `routes.tsx` — registro central de rutas con `lazy()` y mapeo a módulos de permisos.

5. **Patrones arquitectónicos clave**
   - **Separación de responsabilidades**: Página (orquestador) → Hook de dominio (datos/estado) → Componente (UI pura).
   - **Hooks de dominio granulares** (`useBookings`, `useInvoices`, `usePortalInvoices`...).
   - **`useListPage` / `useListFilters` / `useDialogState`** como patrón estándar de páginas de listado.
   - **Optimistic UI** en eliminaciones (navegación inmediata + rollback).
   - **Transactional integrity** vía RPCs de Postgres para flujos multi-tabla.
   - **Manejo de errores** centralizado con `sonner`.
   - **Type-safety estricto**: sin `any`, sin `!`, `unknown` en `catch`, validaciones con Zod.

6. **Capa de datos y seguridad**
   - RLS en todas las tablas; función `has_role(user_id, role)` `SECURITY DEFINER` con `SET search_path = public`.
   - `user_roles` separada de `profiles` (anti escalada de privilegios).
   - Jerarquía de roles: Admin, Administrativo, Ventas, Despachador, Mecánico, Auditor.
   - Permisos dinámicos en `role_permissions` (módulo × rol × access_level), expuestos por `useRolePermissions` y `RoleGuard`.
   - Edge Functions validan identidad con `getClaims()` y CORS restringido.

7. **Enrutamiento y autorización**
   - `routes.tsx` define `appRoutes` con `module` por ruta.
   - `MainLayout` estático + `Suspense` por ruta + `AuthGuard` + `RoleGuard`.
   - Portal de cliente aislado en `/portal/*` con `CustomerPortalLayout`.

8. **Generación de documentos (PDFs)**
   - Arquitectura modular en `src/lib/pdf/` con sub-carpetas por documento (`contract/`, `quote/`, `customerStatement/`, `incomeStatement/`).
   - `placeholderRegistry.ts` como única fuente de verdad para tokens de plantillas de contrato.
   - `loadImageAsBase64`, `pdfHelpers` y `shared.ts` reutilizados.

9. **Convenciones de UI/UX**
   - Desktop-first (99% intent), alta densidad, atajo Ctrl+K.
   - Tablas zebra compactas con headers sticky; drill-down side panels en lugar de columnas de acción.
   - `MobileCardList` reemplaza tablas en mobile.
   - Componentes estandarizados: `DetailPageHeader`, `FormPageHeader`, `TotalsSummary`, `EmptyState`, `StatusBadge`.

10. **Localización**
    - Zona horaria `America/Monterrey` (`nowMty()`); fechas DD/MM/YYYY.
    - Moneda MXN por defecto, formato `es-MX` vía `formatCurrency`.
    - UI 100% en español mexicano.

11. **Testing**
    - Vitest + jsdom, mocks de Supabase en `src/test/helpers/mockSupabase.ts`.
    - Cobertura de flujos críticos: bookings, invoices, payments, exportCsv.

12. **Versionado y changelog**
    - Versionado semántico mantenido en `public/changelog.json`.
    - Política mandatoria: actualizar changelog tras cada cambio.

13. **Lineamientos para evolucionar la arquitectura**
    - Cuándo extraer un hook vs un componente.
    - Cuándo crear una RPC vs lógica en cliente.
    - Cuándo añadir una Edge Function.
    - Cómo añadir un nuevo módulo (ruta + permiso + hook + página + tests).

14. **Referencias**
    - `README.md`, `public/changelog.json`, `src/lib/constants.ts`, `src/lib/config.ts`, memoria del proyecto en `.lovable/memory/`.

## Verificación post-cambio
- Archivo `architecture.md` creado en raíz, ~250–350 líneas, formateado con encabezados Markdown nivel `##`/`###`, bloques de código y un diagrama ASCII.
- Sin cambios en código ni en `changelog.json` (es solo documentación interna; no requiere bump de versión).

¿Procedo a crearlo?
