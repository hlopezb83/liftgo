## Sidebar — Oleada 1 (v7.235.0)

**Analogía:** al menú del restaurante le agregamos etiquetas "quedan 3", un botón "+ Nuevo" que sugiere los platos que puedes pedir según tu rol, un puntito ámbar cuando cambia la carta, y hacemos que la carta se abra justo en la sección donde estás parado.

---

### 1. Badges de conteo (1 solo RPC, sin polling)

- **Migración nueva** `get_sidebar_badge_counts()` (`SECURITY DEFINER`, `STABLE`, `SET search_path = public`): un `json_build_object` con 4 counts globales — `maintenance_open`, `deliveries_today`, `returns_today`, `intents_pending`. `REVOKE ALL` a `PUBLIC`/`anon` + `GRANT EXECUTE` a `authenticated`.
  - Antes de escribir el SQL: `supabase--read_query` para confirmar los valores reales de `deliveries.status` (el brief pide `'pending','scheduled'` — verificar) y que existen `maintenance_logs.work_status`, `bookings.end_date`, `customer_payment_intents.status='pending_review'`. Ajustar la SQL a lo que exista.
- **Hook nuevo** `src/layouts/sidebar/useSidebarBadgeCounts.ts`: `useQuery` con key `["sidebar-badge-counts"]`, `staleTime: 60_000`, sin `refetchInterval`.
- **navConfig**: extender `NavItem` con `badgeKey?: SidebarBadgeKey`. Marcar Entregas/Devoluciones/Mantenimiento/Facturas.
- **SidebarNavSection**: en `NavMenuItem` renderizar `SidebarMenuBadge` sólo cuando `count > 0`, con `aria-label`. Importar `SidebarMenuBadge` (verificar el archivo real bajo `src/components/ui/sidebar/`; si no existe, usar un `<span>` estilizado tipo badge).

### 2. Botón "+ Nuevo"

- **Nuevo** `src/layouts/sidebar/SidebarQuickCreate.tsx` con `DropdownMenu`. 4 acciones:
  - Nueva Reserva → `/bookings/new` (adminOnly, coincide con `routes-config.tsx`).
  - Nueva Cotización → `/quotes/new` (módulo "Cotizaciones", cualquier acceso).
  - Nueva Factura → `/invoices/new` (módulo "Facturas", `requiresFull`).
  - Nuevo Cliente → `/customers?new=1`.
  - Gating usando `useUserRole` + `useRolePermissions` (mismo criterio que `RoleGuard`/`AdminRouteGuard`). Si el usuario no tiene ninguna acción permitida, no renderiza el botón.
  - Colapsado (icon mode): botón cuadrado con menú `side="right"`; expandido: botón `w-full` con menú `side="bottom"`.
- Montarlo en `AppSidebar.tsx` entre `SidebarBranding` y `SidebarContent`.
- **CustomersPage**: al montar, si `searchParams.get("new") === "1"`, abrir el diálogo existente (`CustomerFormDialog`) y limpiar el param con `setSearchParams(..., { replace: true })`.

### 3. Punto de novedad en Changelog

- Extender `SidebarBadgeKey` con `"changelog_new"`; marcar el ítem "Changelog" en navConfig.
- En `NavMenuItem`, para `badgeKey === "changelog_new"`: leer `localStorage["liftgo:lastSeenVersion"]` (try/catch) vs `useCurrentVersion()`; si difiere, renderizar `SidebarMenuBadge` ámbar con `•`.
- En `ChangelogPage.tsx`: `useEffect` que guarda `currentVersion` en `localStorage` al visitar.

### 4. Auto-scroll al ítem activo

- En `NavMenuItem`, `useRef<HTMLLIElement>`. `useEffect(() => { if (isActive) ref.current?.scrollIntoView({ block: "nearest" }); }, [])` (una sola vez al montar). Cálculo de `isActive` local (`pathname` de `useLocation`, `startsWith` salvo `/` exacto). `aria-current` ya lo pone `NavLink`.

### 5. Changelog + versión

- `v7.235.0` (minor). `package.json` bump, entrada en `public/changelog.json` (arriba del array) y detalle en `public/changelog/v7.235.0.json` con las 4 mejoras.

---

## Detalles técnicos

- Todos los nuevos badges reusan la **misma** query key (`["sidebar-badge-counts"]`) → 1 solo request compartido entre 4 ítems, sin re-fetch por hover.
- `SidebarMenuBadge`: si no existe en el shadcn local, uso un `<span>` con `data-slot="sidebar-menu-badge"` compatible.
- Cero cambios a: rutas, `ROUTE_TO_MODULE`, matriz de permisos, `ALWAYS_VISIBLE_ROUTES`, `useVisibleNavGroups`.
- Verificación: `tsgo`, revisión visual del sidebar en `/` y en `/audit` (auto-scroll), y confirmación en Network que sólo se llama `rpc/get_sidebar_badge_counts` una vez.

## Fuera de alcance

- Oleadas siguientes (favoritos, atajos, telemetría de clicks).
- Polling en tiempo real de los badges (fuera por la restricción de perf).
