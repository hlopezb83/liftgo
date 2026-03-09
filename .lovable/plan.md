

# Plan: Módulo Independiente de Estado de Resultados

## Resumen
Extraer el Estado de Resultados del módulo de Reportes a su propia página con entrada dedicada en el sidebar, bajo la sección "Administración".

## Cambios

### 1. Nueva página `src/pages/IncomeStatementPage.tsx`
- Página standalone que importa `IncomeStatementReport` directamente
- Incluye su propio `PageHeader` ("Estado de Resultados")
- Carga los datos necesarios internamente: `useInvoices`, `useMaintenanceLogs`, `useDamageRecords`, `useOperatingExpenses`, `useBookings`, `useForklifts`
- Selector de rango de fechas integrado (igual que en ReportsPage)
- Sin dependencia del módulo de Reportes

### 2. `src/components/AppSidebar.tsx`
- Agregar entrada en sección "Administración":
  - `{ title: "Estado de Resultados", url: "/income-statement", icon: Receipt, roles: ["admin", "administrativo", "auditor"] }`
- Posicionar después de "Gastos Operativos" por proximidad temática

### 3. `src/App.tsx`
- Lazy import de `IncomeStatementPage`
- Nueva ruta: `{ path: "/income-statement", component: IncomeStatementPage, roles: ["admin", "administrativo", "auditor"] }`

### 4. `src/pages/ReportsPage.tsx`
- Mantener el reporte dentro del módulo de Reportes también (acceso desde ambos lados)
- Sin cambios funcionales

### 5. Changelog → v3.22.0

## Recomendación

Mantener el Estado de Resultados **también** disponible dentro del módulo de Reportes para no romper flujos existentes. El sidebar ofrece acceso directo para uso frecuente; el módulo de Reportes agrupa todo para contexto comparativo.

