# Revisión de auditoría externa (draft-diffs-2026-07-18)

Revisé los 8 diffs contra el estado actual del repo. Veredicto por diff:

## ❌ DIFF 1 — Quitar `lovable-tagger` / preconnect `cdn.gpteng.co` — **RECHAZAR**

Es infraestructura **propia de Lovable**, no un widget de terceros:
- `lovable-tagger` inyecta `data-lov-*` en dev para que el editor visual de Lovable pueda seleccionar componentes desde el preview.
- `cdn.gpteng.co` es el CDN del runtime del editor Lovable.

Eliminarlos rompe la experiencia de edición visual en el preview/editor. El auditor mismo duda ("esto NO explica el widget en producción"). **No aplicar.**

## ✅ DIFF 2 — Botones Facturas responsive — **APLICAR**

Toolbar de facturas efectivamente se corta en móvil. `flex-wrap` + icon-only con `aria-label` es correcto y de bajo riesgo.

## ✅ DIFF 3 — Doble asterisco "Periodo de Renta * *" — **APLICAR**

Verificado: `src/features/quotes/pages/QuoteForm.tsx:63` tiene `label="Periodo de Renta *"` **y** `required`, produciendo doble marca. Fix trivial.

## ✅ DIFF 4 — Columna Total alineada a la derecha en cotizaciones — **APLICAR**

Patrón `meta: { align: "right" }` ya soportado por `DataTableV2`. Consistente con Facturas/Reconciliación.

## ✅ DIFF 5 — `aria-label` en botones icon-only — **APLICAR** (verificar cada archivo)

Mejora de accesibilidad sin riesgo funcional. Antes de aplicar cada bloque, revalido líneas exactas (los números pueden haber corrido).

## ⚠️ DIFF 6 — Empty states unificados — **APLICAR PARCIAL**

Verifiqué: `QuotesPage`, `UserManagementPage`, `PortalQuotes` **ya usan `emptyMessage`** vía `ListPageLayout`/`DataTableV2`. El auditor tiene información desactualizada.

Lo que sí queda pendiente y sí aplico:
- Reportes (`ProfitabilityChart`, `ProfitabilityByModelReport`, etc.): sustituir `<p>No hay datos…</p>` por `<EmptyState />`.
- Revisar `CustomersPage` y `SuppliersPage` si aún tienen texto custom (verificar antes de tocar).

Descarto los cambios en archivos que ya migraron.

## ⚠️ DIFF 7 — Calendario: default Lista móvil + leyenda — **APLICAR 7a, DIFERIR 7b**

- **7a (default Lista en móvil):** aplico usando el hook canónico del proyecto `@/hooks/use-mobile` (no el path que sugiere el auditor).
- **7b (leyenda de colores):** el auditor mismo advierte que necesita "lectura extra". El mapa cliente→color hoy vive dentro del GanttChart y no está expuesto. Requiere refactor de exportación. Lo dejo para un sprint dedicado con su propio plan.

## ✅ DIFF 8 — Dashboard móvil — **APLICAR con ajustes**

- **8a (alertas primero en móvil):** aplico con `order-*` responsive limpio (no la variante con `contents`, más frágil).
- **8b (tarjeta huérfana Vendidos):** aplico el selector `[&>*:last-child:nth-child(odd)]:col-span-2` en `StatCards`. Zero JS.

---

## Plan de ejecución (si apruebas)

Un solo sprint **v7.84.0** con los diffs aprobados:

1. DIFF 3 — label QuoteForm (trivial)
2. DIFF 4 — alineación columna Total en QuotesPage
3. DIFF 2 — InvoicesToolbar responsive + `aria-label`
4. DIFF 5 — barrido `aria-label` en los 13 archivos listados (reverificando líneas)
5. DIFF 6 (parcial) — solo reportes + páginas que aún tengan texto custom real
6. DIFF 7a — default Lista en `CalendarPage` móvil
7. DIFF 8a + 8b — orden responsive del Dashboard y grid StatCards

Se descarta: **DIFF 1** completo, **DIFF 7b**, y las partes de **DIFF 6** que ya están migradas.

Al cierre: `bun run lint`, `bunx vitest run`, screenshots de verificación 1600×900 y 698×572, y entrada nueva en `public/changelog.json` + `public/changelog/v7.84.0.json`.

¿Apruebas este alcance o quieres que ajuste (ej. saltar DIFF 5, incluir 7b con investigación previa, etc.)?
