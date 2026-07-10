# Auditoría "Lego" — Código, Business Logic y UI/UX

Objetivo: identificar qué piezas del proyecto pueden reemplazarse por dependencias **estándar de la industria** o consolidarse en primitivas reutilizables, para que la app se ensamble como Lego con menos código custom.

Esta es una auditoría de **solo diagnóstico + roadmap**. No se toca código hasta que apruebes qué lotes ejecutamos.

---

## 1. Estado actual (contexto rápido)

- **~79.5k LOC** totales; sólo 2 archivos de código sobre 300 LOC (excelente tras sprints DRY).
- **50 deps runtime**, ya alineadas al ecosistema shadcn/Radix/TanStack/Supabase.
- Fundaciones DRY existentes: `FormDialog` + `forms/fields/*`, `useEntityMutation`, `createEntityKeys`, `_shared/*` (Edge), `lib/money`, `lib/date`, `lib/domain/*`, `lib/pdf/*`.
- Bundle principal: 615 kB (post-optimización React 19). Los pesados restantes: `@react-pdf/renderer` (1.46 MB), `@e965/xlsx` (331 kB), `recharts` (410 kB) — ya lazy-loaded en su mayoría.

---

## 2. Candidatos a **migrar a dependencias npm estándar**

Ordenados por relación **impacto / esfuerzo**.

### 🟢 Ganancias rápidas (bajo riesgo, alto ROI)


| #   | Área                   | Hoy                                                        | Propuesta                                                              | Beneficio                                                       |
| --- | ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Hotkeys                | `src/hooks/useHotkeys.ts` (custom) + `src/lib/shortcuts`   | `**react-hotkeys-hook**` (estándar de facto, 3 kB)                     | ‑hook custom, atajos declarativos, soporte scopes/secuencias    |
| 2   | Input monetario        | Manejo manual en fields de moneda                          | `**react-number-format**` (estándar en fintech React)                  | Máscaras, thousand-separator, negativos, adjuntable a RHF       |
| 3   | Currency dead-dep      | `currency.js` está en `package.json` **pero no se usa**    | Eliminar                                                               | ‑1 dep sin cambios de código                                    |
| 4   | Screenshot feedback    | `html2canvas` (~180 kB) en `feedback/captureScreenshot.ts` | `**html-to-image**` o `**modern-screenshot**` (30–60 kB, más rápidos)  | Bundle feedback más liviano                                     |
| 5   | URL-state para filtros | `useListFilters` custom con sessionStorage                 | `**nuqs**` (URL-state tipado por Zod, oficial de la comunidad Next/RR) | Filtros compartibles por link, ‑código de sincronización manual |
| 6   | Mensajes Zod es-MX     | Traducción ad-hoc en cada schema                           | `**zod-i18n-map**` + `i18next` core (sólo namespace de Zod)            | Mensajes de validación consistentes en español sin repetir      |


### 🟡 Consolidaciones estructurales (medio esfuerzo)


| #   | Área              | Hoy                                                                                        | Propuesta                                                                                                                                           | Beneficio                                                               |
| --- | ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 7   | Data tables       | `src/components/dataTable/v2` (custom) coexiste con `@tanstack/react-table` (ya instalado) | Unificar todas las tablas en **TanStack Table v8** con un `<DataTable>` genérico + column defs                                                      | Ordenamiento/paginación/filtros nativos, ‑código repetido en 20+ vistas |
| 8   | Kanban DnD        | `@hello-pangea/dnd` (fork mantenimiento de `react-beautiful-dnd`, ya en modo legacy)       | `**@dnd-kit/core` + `@dnd-kit/sortable**` (estándar moderno, 13 kB, accesible, tree-shake)                                                          | Librería viva, mejor a11y, ‑bundle                                      |
| 9   | Virtualización    | `@tanstack/react-virtual` instalado, poco uso                                              | Aplicar en Kanban de Mantenimiento, tablas de MRR y de facturas                                                                                     | UI fluida con listas grandes                                            |
| 10  | XLSX export       | `@e965/xlsx` (331 kB) para escribir Excel de pagos y conciliación                          | `**write-excel-file**` (~40 kB, sólo write) o dejar `@e965/xlsx` **lazy-loaded** por ruta                                                           | ‑280 kB potencial en el chunk de reports                                |
| 11  | PDFs              | `@react-pdf/renderer` (1.46 MB) genera factura/cotización/contrato en cliente              | Opción A: mover generación a **Edge Function** con `pdf-lib` (server-side) → 0 en bundle. Opción B: mantener client + lazy por ruta (ya casi hecho) | Bundle inicial ‑1.4 MB si va a Edge                                     |
| 12  | Firma electrónica | Revisar si hay canvas custom en Deliveries/Returns                                         | `**react-signature-canvas**` (estándar)                                                                                                             | ‑código custom                                                          |


### 🟠 Estratégicos (alto valor, más esfuerzo)


| #   | Área                              | Hoy                                             | Propuesta                                                                                                                       | Beneficio                                         |
| --- | --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 13  | i18n / literales                  | ~100% strings hard-coded en español             | `**react-i18next**` con un solo bundle es-MX; deja preparado en/pt si crece                                                     | Base para expansión, tests independientes de copy |
| 14  | Estado UI global                  | Context puro + prop drilling en algunos módulos | `**zustand**` (1.2 kB) sólo para stores UI transversales (sidebar, filtros globales, feature-flags)                             | ‑re-renders, API mínima                           |
| 15  | Comandos/atajos globales (Ctrl+K) | `cmdk` + implementación manual                  | Combinar con `react-hotkeys-hook` + registro declarativo de acciones por página                                                 | Menos código de registro en cada vista            |
| 16  | Forms — enriquecer wrappers       | 12 wrappers en `forms/fields/`                  | Publicar `forms/fields/*` como paquete interno (`@app/forms`) documentado en Storybook                                          | Onboarding y reutilización cross-proyecto         |
| 17  | Charts                            | `recharts` (410 kB)                             | Evaluar `**visx**` o `**echarts-for-react**` sólo si aparecen gráficos que recharts no cubra. Por ahora, mantener y seguir lazy | Sin acción inmediata                              |


---

## 3. Business logic — qué está sano y qué extraer

**Sano (mantener):**

- `lib/domain/*` (rentalCalculation, invoiceTotals, lineItems) con tests.
- `lib/rules/*` (invoices, quotes) — reglas de dominio puras.
- RPCs de Supabase para workflows multi-tabla.
- Edge Functions ya usan `_shared/http`, `requireAdmin/Role`, `getFacturapiConfig`.

**Candidatos a aislar como paquetes internos** (sin salir aún a npm público, pero con superficie clara):

- `@app/domain-fleet` — cálculos de renta, prorrateos, ciclos de facturación.
- `@app/cfdi` — envoltorio Facturapi + mapping SAT (ya casi listo en `_shared/facturapi`).
- `@app/forms` — `FormDialog` + fields + schemas comunes.
- `@app/pdf-templates` — plantillas react-pdf compartidas (Header/Footer/Totals/LineItems ya existen en `lib/pdf/components`).

Beneficio: contratos versionados internos, imposible que la UI toque cálculos financieros directamente.

---

## 4. UI/UX — hallazgos

**Fortalezas actuales**

- Densidad alta y coherente (`compact zebra tables`, drill-down panels).
- Tokens semánticos en `index.css`; sin hardcodes de color.
- `MobileCardList` estandarizado; `FormDialog` unificado.

**Oportunidades**

1. **EmptyState / ErrorBoundary primitivos**: no existe un `<EmptyState>` genérico; se repite el patrón "sin datos" ~10 veces. Crear componente en `components/domain/`.
2. **Loading skeletons**: cada módulo dibuja su propio skeleton. Crear `TableSkeleton`, `CardListSkeleton`, `FormSkeleton`.
3. **Confirmaciones destructivas**: existe `confirm-dialog.tsx` — auditar cuántos flujos aún usan `window.confirm` o `AlertDialog` ad-hoc y migrarlos.
4. **Toolbar de tablas**: patrón "buscador + filtros + acciones" reimplementado por módulo → extraer `<ListToolbar>`.
5. **Detail panels**: cada módulo estructura `<DetailPageHeader>` + secciones a mano — proponer `<DetailLayout sections={[…]}>` declarativo.
6. **Accesibilidad**: al migrar kanban a `@dnd-kit`, se gana anuncio ARIA nativo.
7. **Estados de KPI**: `KpiTile` ya existe; falta variante con sparkline (usar `recharts` mini o `visx`).

---

## 5. Roadmap propuesto (lotes ejecutables)

Cada lote es una PR independiente, con tests y changelog.

```text
Lote A — Higiene inmediata (≈ 1 sesión, -100 LOC + -1 dep)
  A1. Eliminar currency.js (dead dep)
  A2. Reemplazar useHotkeys por react-hotkeys-hook
  A3. Reemplazar html2canvas por html-to-image en feedback

Lote B — UI primitives (≈ 2 sesiones, -300 LOC)
  B1. <EmptyState>, <TableSkeleton>, <ListToolbar>, <DetailLayout>
  B2. Migrar 5-8 vistas piloto a los nuevos primitivos

Lote C — Tablas unificadas (≈ 3 sesiones, -500 LOC)
  C1. <DataTable> genérico sobre @tanstack/react-table
  C2. Migrar dataTable/v2 → nuevo DataTable
  C3. Aplicar en Invoices, Bookings, Fleet, CRM

Lote D — Kanban moderno (≈ 1 sesión)
  D1. Migrar Maintenance kanban a @dnd-kit/sortable
  D2. Retirar @hello-pangea/dnd

Lote E — Formularios de moneda + validaciones i18n (≈ 1 sesión)
  E1. CurrencyField sobre react-number-format
  E2. zod-i18n-map en español

Lote F — URL-state (≈ 2 sesiones)
  F1. Introducir nuqs y migrar useListFilters de Invoices/Bookings/Quotes

Lote G — PDF a Edge (≈ 3 sesiones, -1.4 MB bundle inicial)
  G1. Prototipo pdf-lib server-side para facturas
  G2. Migrar cotizaciones y contratos
  G3. Retirar @react-pdf/renderer del cliente

Lote H — Packages internos (opcional, ≈ 2 sesiones)
  H1. Reorganizar lib/domain, lib/pdf, forms/ como workspaces
```

**Estimación total**: `-1,000 a -1,500 LOC`, `-3 deps runtime`, `-1.5 MB` de bundle inicial si se hace G.

---

## 6. Detalles técnicos

- Todas las migraciones mantienen tests existentes; se añaden tests unitarios por wrapper nuevo.
- Cada lote lleva su entrada de changelog (SemVer):
  - A/B/E/F → `minor`
  - C/D/G/H → `major` (cambia superficie de componentes o infra)
- La migración PDF (G) requiere validar tipografías embebidas en la Edge Function y regenerar snapshots.
- El paso a `@dnd-kit` (D) requiere reescribir handlers `onDragEnd` — API distinta pero equivalente.
- `nuqs` (F) requiere elegir modo `shallow`/`history` para no romper analytics.

---

## 7. Qué necesito de ti

Confirma **cuáles lotes ejecutamos** y en qué orden:

- ¿Arrancamos por **A + B** (higiene + primitivos UI) para consolidar cimientos?
- ¿Priorizamos **G** (PDF a Edge) para ganar bundle rápidamente?
- ¿Marcamos **H** (paquetes internos) como fuera de alcance por ahora?

Con tu selección, transformo el lote elegido en un plan de implementación detallado y arrancamos.

Hacemos todos los lotes en orden