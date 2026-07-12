# Plan: Hardening de @tanstack/react-query

## Objetivo
Llevar la implementación de TanStack Query v5 a grado "production-grade": todas las query keys generadas por factories, los hooks crudos migrados a `defineEntityQueries` / `useEntityMutation`, prefetching sistemático y cero duplicidad de invalidaciones.

## Estado actual (baseline)
- **Versión:** ya estamos en `@tanstack/react-query@5.101.2` (última estable al momento del análisis).
- **Adopción de patrones canónicos:** ~35 % del código usa `defineEntityQueries` / `useEntityMutation`.
- **Hooks crudos:** ~42 archivos con `useQuery` / `useMutation` directos.
- **Keys ad-hoc:** ~48 instancias de `queryKey` como string/array literal.
- **Prefetching:** solo en `DataTableBodyV2` y `SidebarNavSection`; < 5 % de listados aprovechan prefetch de detalle.

## Hallazgos priorizados

### Alta prioridad
1. **Users (`src/features/users/hooks/`)**
   - `useUsersQuery.ts` define `USERS_QUERY_KEY = ["users_with_roles"]` a mano.
   - `useToggleStatus.ts`, `useInviteUser.ts`, `useDeleteUser.ts`, `useResetPassword.ts` usan `useMutation` crudo con `notifySuccess` manual.
   - Riesgo: invalidaciones inconsistentes y UX de toast fragmentada.

2. **Customer Portal (`src/features/portal/hooks/`)**
   - Keys hardcodeadas como `["portal_quotes"]`, `["portal_collection_account"]`.
   - Riesgo de colisión con keys del admin y cache stale para usuarios del portal.

### Media prioridad
3. **Dashboard / Analytics (`src/features/dashboard/hooks/`)**
   - `useMrrDetail.ts`, `useFinancialKpis.ts`, `useDashboardStats.ts` usan `useQuery` crudo con lógica de `dateKey`.
   - Fácilmente migrables a `defineEntityQueries` con `list(filter)`.

4. **Audit & Logs (`src/features/audit/hooks/`)**
   - `useAuditLogs.ts` y `useActivityMetrics.ts` tienen query keys inline complejos.

### Baja prioridad
5. **Guardias `enabled` redundantes:** `useInvoices.ts` y `useForklifts.ts` agregan `enabled: !!id` aunque `defineEntityQueries.detail(id)` ya lo provee.
6. **Oportunidades de prefetch:** Suppliers, Parts, Mechanics, etc., no precargan filas al hacer hover.

## Fases de trabajo

### Fase 1 — Consolidar keys de Users y Portal
- Crear `src/features/users/lib/queryKeys.ts` con `createEntityKeys("users")`.
- Crear `src/features/portal/lib/queryKeys.ts` con `createEntityKeys("portal")`.
- Refactorizar mutaciones de users a `useEntityMutation` con `invalidateKeys` centralizadas.
- Refactorizar hooks de portal a `useQuery(portalQueries.xxx())`.
- Ajustar consumidores y tests.

### Fase 2 — Migrar Dashboard y Audit a `defineEntityQueries`
- `useMrrDetail.ts`, `useFinancialKpis.ts`, `useDashboardStats.ts` → `dashboardQueries`.
- `useAuditLogs.ts`, `useActivityMetrics.ts` → `auditQueries`.
- Aprovechar `list(filter)` para parámetros dinámicos (fecha, rango, etc.).

### Fase 3 — Barrer hooks sueltos restantes
- Revisar raw `useQuery` en: `useDocuments.ts`, `usePublicBranding.ts`, `useCompanySettings.ts`, `useCxpApprovalThreshold.ts`, `useChangelog.ts`, `useCashFlowSettings.ts`, `useCashFlowProjection.ts`, etc.
- Criterio: si el hook lee una tabla/entidad, migrar a `defineEntityQueries`; si es un cálculo/derivado, mantener `useQuery` pero centralizar la key en una factory.

### Fase 4 — Estandarizar prefetching en listados
- Extender `DataTableV2` / list pages para pasar `onRowPrefetch` que llame `queryClient.prefetchQuery(entityQueries.detail(row.id))`.
- Empezar por módulos de alta frecuencia: Quotes, Bookings, Invoices, Customers, Forklifts.
- Añadir `staleTime` adecuado para detalles (ej. 60_000 ms).

### Fase 5 — Limpieza y alineación
- Eliminar `enabled: !!id` redundante donde `defineEntityQueries` ya lo gestione.
- Revisar `gcTime`, `retry` y `refetchOnWindowFocus`; respetar defaults globales de `AppProviders.tsx` salvo justificación documentada.
- Asegurar que `queryClient` no se use para invalidaciones manuales fuera de helpers; preferir `invalidateKeys` en `useEntityMutation`.

### Fase 6 — Verificación
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run knip`
- Smoke manual en listados con prefetch (hover → Devtools → query Fresh).

### Fase 7 — Documentación y Changelog
- Actualizar `src/lib/query/README.md` (o crearlo) con ejemplos de `defineEntityQueries`, `useEntityMutation`, `createEntityKeys` y reglas de prefetch.
- Agregar entrada `v{X.Y.Z}` a `public/changelog.json` y detalle en `public/changelog/v{X.Y.Z}.json`.

## Entregables
- Keys de Users y Portal 100 % factory-based.
- Dashboard y Audit migrados a `defineEntityQueries`.
- Prefetch de detalle en listados principales.
- Tests pasando, cero nuevos warnings.
- Documento de patrones y changelog actualizado.

## Métrica de éxito
- Reducir instancias de `queryKey:` literales de ~48 a < 10 (casos justificados de cálculos derivados).
- Aumentar adopción de `defineEntityQueries` / `useEntityMutation` de ~35 % a > 80 %.
- Prefetch activo en ≥ 6 listados principales.