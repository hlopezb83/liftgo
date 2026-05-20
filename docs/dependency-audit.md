# Auditoría §20 — Dependencias vs helpers internos

> Generado por `scripts/dependency_audit.py`. Doctrina: `architecture.md` §20.

## Resumen ejecutivo

- Helpers internos auditados: **16** (727 LOC propios).
- KEEP: **15** · MIGRAR: **1** · RETIRADO: **0**.
- LOC potencialmente migrable a una dep canónica: **0**.
- Dependencias canónicas activas (§20.4): **45** · no canónicas a evaluar: **2**.
- Aplicaciones previas de §20 ya entregadas: `6.6.0-alpha.1` (PDF → @react-pdf/renderer), `6.6.0-alpha.3` (toasts → sonner), `6.6.0-alpha.4` (PR template).

## Tabla 1 — Helpers internos

| Archivo | Tipo | LOC | Consumidores | Dep canónica equiv. | Veredicto | Prioridad | Acción |
| --- | --- | --- | --- | --- | --- | --- | --- |
| src/lib/exportCsv.ts | util | 22 | 13 | papaparse | KEEP (ya usa canónica) | — | Ya delega en papaparse; mantener. |
| src/lib/formatCurrency.ts | util | 27 | 71 | Intl.NumberFormat (built-in) | KEEP (glue <30 LOC) | — | Wrapper de 27 LOC sobre Intl con locale es-MX. |
| src/lib/utils.ts | util | 66 | 130 | clsx + tailwind-merge + date-fns | KEEP (ya usa canónicas) | — | cn, formatMtyDate, nowMty; delega en deps canónicas. |
| src/lib/lineItems.ts | util | 51 | 11 | — | KEEP (sin equivalente) | — | Narrowing JSONB específico Supabase; no hay equivalente. |
| src/lib/rpc.ts | util | 23 | 9 | @supabase/supabase-js | KEEP (glue <30 LOC) | — | Wrapper tipado de 23 LOC sobre supabase.rpc. |
| src/lib/telemetry.ts | util | 31 | 1 | Sentry (futuro) | KEEP (capa de cambio) | baja | Abstracción para conectar Sentry sin tocar callers. |
| src/lib/forms/coerce.ts | forms | 13 | 5 | — | KEEP (glue <30 LOC) | — | Coerciones triviales (13 LOC) para form prefill. |
| src/hooks/use-mobile.tsx | hook | 19 | 4 | matchMedia (built-in) | KEEP (glue <30 LOC) | — | Hook breakpoint mobile, 19 LOC. |
| src/hooks/useDebouncedValue.ts | hook | 14 | 1 | use-debounce | KEEP (glue <30 LOC) | baja | 14 LOC, 1 consumidor. Migrable a use-debounce si crece. |
| src/hooks/useDialogState.ts | hook | 40 | 4 | — | KEEP (sin equivalente) | — | Patrón propio para Sheet/Dialog state. |
| src/hooks/useFormState.ts | hook | 0 | 0 | react-hook-form | MIGRAR | media | 9 LOC, 7 dialogs. Duplica RHF (ya canónico); migrar incrementalmente. |
| src/hooks/useListFilters.ts | hook | 86 | 7 | react-router + @tanstack/react-table | KEEP (ya usa canónicas) | — | Compone useSearchParams + filtro client; no duplica. |
| src/hooks/useListPage.ts | hook | 106 | 17 | @tanstack/react-table | KEEP (ya usa canónica) | — | Headless 100% TanStack Table; documentado en §20.4. |
| src/hooks/useDocuments.ts | hook | 102 | 4 | @tanstack/react-query | KEEP (ya usa canónica) | — | Domain hook sobre supabase + react-query. |
| src/hooks/useBreadcrumbEntityLabel.ts | hook | 97 | 1 | @tanstack/react-query | KEEP (ya usa canónica) | — | Domain hook. |
| src/hooks/useVisibleNavGroups.ts | hook | 30 | 1 | — | KEEP (sin equivalente) | — | Lógica de visibilidad por rol. |

## Tabla 2 — Dependencias (`package.json`)

| Paquete | Versión | Categoría | Mapeo §20.4 | Consumidores |
| --- | --- | --- | --- | --- |
| @hello-pangea/dnd | ^18.0.1 | No canónica (evaluar) | Drag & drop para Kanban de feedback/maintenance. Canónica de facto. | 7 |
| @hookform/resolvers | ^3.10.0 | Canónica activa | Formularios | 0 |
| @radix-ui/react-accordion | ^1.2.11 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-alert-dialog | ^1.1.14 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-checkbox | ^1.3.2 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-collapsible | ^1.1.11 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-dialog | ^1.1.14 | Canónica activa | UI primitives (shadcn/Radix) | 3 |
| @radix-ui/react-dropdown-menu | ^2.1.15 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-label | ^2.1.7 | Canónica activa | UI primitives (shadcn/Radix) | 2 |
| @radix-ui/react-popover | ^1.1.14 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-scroll-area | ^1.2.9 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-select | ^2.2.5 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-separator | ^1.1.7 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-slot | ^1.2.3 | Canónica activa | UI primitives (shadcn/Radix) | 3 |
| @radix-ui/react-switch | ^1.2.5 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-tabs | ^1.1.12 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-toggle | ^1.1.9 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-toggle-group | ^1.1.10 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @radix-ui/react-tooltip | ^1.2.7 | Canónica activa | UI primitives (shadcn/Radix) | 1 |
| @react-pdf/renderer | ^4.5.1 | Canónica activa | PDF | 21 |
| @supabase/supabase-js | ^2.95.3 | Canónica activa | Backend (Cloud) | 1 |
| @tanstack/react-query | ^5.83.0 | Canónica activa | Estado servidor | 76 |
| @tanstack/react-table | ^8.21.3 | Canónica activa | Tablas | 9 |
| @tanstack/react-virtual | ^3.13.24 | Canónica activa | Tablas (virtual) | 1 |
| class-variance-authority | ^0.7.1 | Canónica activa | UI primitives (shadcn) | 8 |
| clsx | ^2.1.1 | Canónica activa | Class merging | 1 |
| cmdk | ^1.1.1 | Canónica activa | UI primitives (shadcn) | 1 |
| currency.js | ^2.0.4 | Canónica activa | Cálculos financieros | 3 |
| date-fns | ^3.6.0 | Canónica activa | Fechas / zonas horarias | 79 |
| date-fns-tz | ^3.2.0 | Canónica activa | Fechas / zonas horarias | 1 |
| dompurify | ^3.4.2 | No canónica (evaluar) | Sanitiza HTML del manual (help system). Usado puntualmente. | 1 |
| file-saver | ^2.0.5 | Canónica activa | Descargas blob (lazy import) | 5 |
| html2canvas | ^1.4.1 | Canónica activa | Captura screenshot DOM (lazy, feedback) | 1 |
| lucide-react | ^0.462.0 | Canónica activa | Iconos | 195 |
| next-themes | ^0.4 | Canónica activa | Tema | 3 |
| papaparse | ^5.5.3 | Canónica activa | CSV | 1 |
| react | ^18.3.1 | Canónica activa | UI runtime | 209 |
| react-day-picker | ^8.10.1 | Canónica activa | Fechas (calendar UI) | 6 |
| react-dom | ^18.3.1 | Canónica activa | UI runtime | 1 |
| react-dropzone | ^15.0.0 | Canónica activa | Drag & drop archivos | 3 |
| react-hook-form | ^7.61.1 | Canónica activa | Formularios | 33 |
| react-router-dom | ^6.30.1 | Canónica activa | Router | 71 |
| recharts | ^2.15.4 | Canónica activa | Charts | 9 |
| sonner | ^1.7.4 | Canónica activa | Toasts | 86 |
| tailwind-merge | ^2.6.0 | Canónica activa | Class merging | 1 |
| tailwindcss-animate | ^1.0.7 | Canónica activa | Animaciones | 0 |
| zod | ^3.25.76 | Canónica activa | Validación | 8 |

## Oportunidades priorizadas

### Helpers a migrar
- **src/hooks/useFormState.ts** → `react-hook-form` (prioridad media, 0 consumidores). 9 LOC, 7 dialogs. Duplica RHF (ya canónico); migrar incrementalmente.

### Dependencias no canónicas a evaluar
- **@hello-pangea/dnd@^18.0.1** (7 consumidores) — Drag & drop para Kanban de feedback/maintenance. Canónica de facto.
- **dompurify@^3.4.2** (1 consumidores) — Sanitiza HTML del manual (help system). Usado puntualmente.

## Historial de aplicaciones de §20

| Versión | Cambio | Resultado |
| --- | --- | --- |
| 6.6.0-alpha.1 | jsPDF → @react-pdf/renderer | PDFs declarativos en todos los documentos |
| 6.6.0-alpha.2 | Doctrina §20 documentada | architecture.md §20.1–§20.7 |
| 6.6.0-alpha.3 | Toast legacy → sonner | -186 LOC, -1 dep (@radix-ui/react-toast) |
| 6.6.0-alpha.4 | PR template con checklist §20 | .github/pull_request_template.md |
