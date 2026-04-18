

# Auditoría de Rendimiento — LiftGo

He revisado el bundle, las queries, los hooks de datos y los patrones de re-render. La app **funciona bien arquitectónicamente** (lazy routes, React Query con `staleTime`, RPCs agregadas para Dashboard), pero hay varios puntos donde estamos pagando costos innecesarios.

---

## A. Llamadas a base de datos / red

### A1. **`select("*")` en todas las tablas grandes** (CRÍTICO)
23 hooks usan `select("*")` sin filtros ni paginación: `useInvoices`, `useBookings`, `useForklifts`, `useCustomers`, `useQuotes`, `useMaintenanceLogs`, `useOperatingExpenses`, etc. A medida que crezcan los datos, cada visita a Dashboard / Calendario / Reportes descarga **todas las filas históricas**.
- **Impacto:** transferencia de KB/MB innecesarios + parseo JSON lento + memoria React Query.
- **Fix:** seleccionar solo las columnas usadas + filtrar por rango (ej. facturas últimos 12 meses) + paginar server-side cuando supere ~500 filas.

### A2. **N+1 implícito vía hooks múltiples en una misma página**
Páginas que disparan 3-6 queries grandes en paralelo:
- `Dashboard`: `useDashboardStats` (RPC) + `useFinancialKpis` (RPC) + `useForklifts` (lista completa solo para el `InsuranceAlert`).
- `CustomerDetailPage`: `useCustomers` + `useBookings` + `useInvoices` (todas globales) solo para filtrar por un cliente.
- `IncomeStatementPage / Reportes`: aglutina `useInvoices + useMaintenanceLogs + useDamageRecords + useOperatingExpenses + useBookings + useForklifts + useQuotes`.
- **Fix:** crear RPCs agregadas (`get_customer_summary(id)`, `get_income_statement(start,end)`) que devuelvan solo lo necesario, igual que ya hicimos con `get_dashboard_stats`.

### A3. **`useUpdateForklift` hace fetch extra dentro de la mutación**
Lee `operating_expenses` con `ilike` y luego hace update — son 2 round-trips adicionales por cada edición. Debería ser un trigger SQL o estar dentro de un RPC.

### A4. **`AuthProvider` dispara `getSession()` y `onAuthStateChange` en paralelo**
El `onAuthStateChange` ya emite el `INITIAL_SESSION`; el `getSession()` extra es redundante y causa un re-render adicional al arranque.

### A5. **`staleTime` inconsistente**
Algunos hooks tienen `60_000`, otros nada (default `0` → refetch en cada mount). Hooks sin `staleTime`: `useInvoice(id)`, `useForklift(id)`, `useDashboardStats` (30s OK), `useFinancialKpis`. Estandarizar a 60s en lectura, 5min en catálogos (`useEquipmentModels`, `useDrivers`, `useMechanics`, `useSuppliers`, `useCompanySettings`).

---

## B. Re-renders y trabajo en el main thread

### B1. **Dashboard recalcula 7 `useMemo` en cascada**
Aunque están memoizados, todos dependen de `stats?.x.y` (referencia nueva en cada fetch). Aceptable, pero los **subcomponentes hijos no están memoizados** (`StatCards`, `FleetStatusChart`, `CashFlowChart`, etc.) → cada refetch de stats vuelve a renderizar las charts de Recharts (caro).
- **Fix:** envolver los componentes de `src/components/dashboard/*` con `React.memo`.

### B2. **`GanttChart` / `EquipmentListView` recalculan `eachDayOfInterval` en cada render**
`days` y `totalDays` se calculan fuera del `useMemo` (líneas 52-53). Si el padre re-renderiza por cualquier estado (toggle de tabs), se recrea el array de 30 días.

### B3. **`InsuranceAlert` recibe **toda** la flota** solo para filtrar pólizas próximas a vencer — debería ser parte del RPC de stats.

### B4. **`useIncomeStatementData` itera 4 colecciones grandes con `filter().forEach()`**
Para periodos amplios procesa N facturas × M meses en cada cambio de filtro. `useMemo` ayuda, pero si los datos vienen sin filtrar de A1, el costo escala mal. La solución real es pre-filtrar en el RPC.

### B5. **Falta de virtualización en listas largas**
`MobileCardList` y tablas usan paginación cliente de 25, lo cual está bien, **pero** `GanttChart` renderiza un `<div>` por día × por montacargas (ej. 30 × 50 = 1,500 nodos) sin virtualización. Aceptable hoy, riesgo a futuro.

---

## C. Bundle y assets

### C1. **`recharts` está cargado en cada chunk de página que usa charts**
Recharts pesa ~110KB gzip. Cada `Reports/Dashboard/UtilizationCharts/CashFlowChart/FleetStatusChart` lo importa estático. Se está duplicando vía code-splitting de rutas (cada página lazy lo incluye).
- **Fix:** mover gráficas a sub-componentes `lazy()` o configurar `manualChunks` en Vite para extraer `recharts` y `jspdf` a un chunk compartido.

### C2. **`jspdf` ya está dynamic-imported** ✅ — bien hecho en `*PDFButton.tsx`.

### C3. **`vite.config.ts` no define `build.rollupOptions.manualChunks`**
Vendor chunk único enorme. Recomendado:
```ts
manualChunks: {
  recharts: ['recharts'],
  radix: [/* todos los @radix-ui */],
  vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
}
```

### C4. **`lucide-react` importa por named export (✅ tree-shakeable)** — pero `AppSidebar.tsx` importa **30+ iconos en un solo import**. Está bien para tree-shaking, no es problema.

### C5. **Sin compresión / formatos de imagen modernos para `public/placeholder.svg`** — no es un problema serio (es SVG).

### C6. **`@hello-pangea/dnd`** — solo se usa en CRM Kanban y Maintenance Kanban; verificar que esté en chunks lazy (parece estarlo por las rutas lazy).

---

## D. React Query / cache

### D1. **`QueryClient` tiene `retry: 1` y `staleTime: 30s` global** ✅ correcto.
Falta `gcTime` explícito (default 5min está OK) y **no se usa `refetchOnWindowFocus: false`** → cada vez que el usuario regresa a la pestaña, todas las queries `stale` se refetchean. Para una app interna esto es ruido.

### D2. **Invalidaciones agresivas**
`useUpdateForklift` invalida `forklifts` + `forklifts/:id` + `operating_expenses`. Considerar usar `setQueryData` para actualizar localmente sin refetch completo.

---

## Plan de acción priorizado

| # | Acción | Impacto | Esfuerzo |
|---|---|---|---|
| **1** | Crear RPC agregada `get_income_statement(start,end)` y RPC `get_customer_summary(id)` para evitar descargar todas las facturas/bookings/forklifts | Alto | Medio |
| **2** | Reemplazar `select("*")` por listas explícitas de columnas en los 6 hooks más usados (`useInvoices`, `useBookings`, `useForklifts`, `useCustomers`, `useQuotes`, `useMaintenanceLogs`) | Alto | Bajo |
| **3** | Configurar `manualChunks` en `vite.config.ts` para separar `recharts`, `radix-ui` y `vendor` | Alto | Bajo |
| **4** | Añadir `refetchOnWindowFocus: false` y subir `staleTime` a 5min en hooks de catálogos estáticos | Medio | Bajo |
| **5** | Mover lógica de `useUpdateForklift` (sync de `costo_venta`) a un trigger DB | Medio | Medio |
| **6** | Eliminar el `getSession()` extra en `AuthProvider` (usar solo `onAuthStateChange`) | Bajo | Trivial |
| **7** | Envolver componentes pesados de Dashboard (`FleetStatusChart`, `CashFlowChart`, `UtilizationCharts`, `InvoiceBreakdown`) con `React.memo` | Medio | Bajo |
| **8** | Memoizar `days`/`totalDays` en `GanttChart` y `EquipmentListView` | Bajo | Trivial |
| **9** | Añadir paginación server-side a `useInvoices` y `useBookings` cuando superen 500 filas | Alto (a futuro) | Medio |
| **10** | Considerar virtualización (`@tanstack/react-virtual`) para `GanttChart` cuando la flota crezca >100 unidades | Bajo (hoy) | Medio |

**Recomendación:** ejecutar pasos **1-4 ahora** (mayor ROI con bajo riesgo). Pasos 5-8 son pulido. 9-10 son preventivos para escala futura.

