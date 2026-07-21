
# Lote R6 — Plan verificado contra el código

Verifiqué cada hallazgo del documento leyendo los archivos citados. Marco lo que es **bug real**, lo que **ya está corregido** y lo que es **mejora sin bug**.

---

## Bloque 1 — RoleGuard `fallback={null}` ✅ BUG REAL

`src/layouts/RoleGuard.tsx:29-31` usa `fallback ?? node`. Con `fallback={null}` (nullish) devuelve `node` (el `NoAccess` grande). El fix propuesto en R6 es correcto.

**Cambio:** `renderFallback` distingue `undefined` (usa `node`) vs `null`/`ReactNode` (usa fallback tal cual).

**Test:** render con `fallback={null}` no pinta nada; sin fallback pinta `NoAccess`.

---

## Bloque 2 — Multi-moneda en reportes/portal ✅ BUG REAL

Confirmado leyendo el código:

- `AgingReport.tsx:40` suma `i.balance` crudo. `useInvoicesWithBalance` ya expone `balance_mxn` (v7.151.0) → migrar buckets, total y export a `balance_mxn` (fallback `toMxn(balance, moneda, tipo_cambio)`).
- `RevenueReport.tsx:29-31` suma `Number(inv.total)` sin TC → normalizar con `toMxn(inv.total, inv.moneda, inv.tipo_cambio)` en `invoiced` y `paid`.
- `PortalStatement.tsx:30,38,41` suma `total`/`balance` crudos y el RPC `get_portal_invoices` (mig `20260719182428`) **no devuelve `tipo_cambio`** (solo `moneda`).
  - Migración nueva idempotente que recrea `get_portal_invoices` agregando `tipo_cambio numeric` a la firma.
  - Regenerar types (auto).
  - `PortalStatement.tsx`: normalizar totales con `toMxn` y añadir badge `USD/MXN` por fila (tabla y detalle si aplica).

**Tests:** unit tests de normalización en los tres reportes (factura USD $1000 TC 20 → $20 000 MXN en bucket/total).

**Comentario/ADR** breve en `src/lib/money/index.ts` (o `docs/`) con la regla: “todo agregado de facturas pasa por `toMxn`”.

---

## Bloque 3 — Dark mode: `text-destructive` ilegible ✅ BUG REAL

`src/index.css:119` define en `.dark` `--destructive: 0 62% 30%` (rojo oscuro sobre fondo oscuro). El texto queda ~1.8:1.

**Cambio:** ajustar tokens `.dark` a `--destructive: 0 84% 65%` (mismo hue, más claro) y revisar `--warning`/`--success` para asegurar ≥4.5:1 contra `--background` dark. Sin tocar variantes light.

**Verificación:** cálculo de contraste WCAG en test o snapshot manual documentado en changelog.

---

## Bloque 4 — Spacing (parcialmente ya aplicado)

Estado real tras leer los archivos:

| Item | Estado | Acción |
|---|---|---|
| 4.1 Dashboard `gap-4`→`gap-6` | Real: línea 25 (KPI grid) sigue en `gap-4` (la 36 ya es `gap-6`) | Cambiar `gap-4` → `gap-6` en la grid principal |
| 4.2 `ListPageLayout` `space-y-4 sm:space-y-6` → `space-y-6` | Real (línea 123) | Unificar a `space-y-6` |
| 4.3 `AccountsPayableKpiCards` gap-3→gap-4 | **Ya en gap-4** ✅ | Mantener; ajustar sólo si labels truncan (añadir `lg:grid-cols-3 xl:grid-cols-6` para respirar a 1440px) |
| 4.4 `TotalsSummary` "IVA (0.16%)" | **Ya normalizado** en v7.152.0 (`displayRate`) ✅ | Ninguna |
| 4.5 `PortalInvoiceDetail` `-mt-2` | Verificar y quitar si existe | Chequeo + remoción |
| 4.6 `KpiTile` `px-3`→`px-4` + `line-clamp-2` | Real | Aplicar |
| 4.7 Unificar 3 cards KPI en 1 | Refactor grande | **Diferir** a Lote R7 (mencionado como deuda) |

---

## Bloque 5 — Pulido nivel 2

Aplicables ahora (bajo riesgo):

1. Header sticky con `bg-card/95 backdrop-blur-sm` en `DataTableV2` (thead `sticky`).
5. Constante `CONTROL_HEIGHT` en `src/lib/ui/tokens.ts` reemplazando `h-[38px]` en filtros.
7. `RecurringBillingBadge.tsx:14,19` cambia `parseISO` por `parseDateLocal` (helper existente para date-only en MTY). Bug real aunque menor en MTY.

Diferir (requieren definir sistema, mejor en Lote R7):

2. Footers de diálogo unificados.
3. Escala de anchos de diálogo.
4. FAB móvil vs fila de total (medir primero).
6. Fade de scroll horizontal en tablas móviles.

---

## Descartado (no bug)

- 4.4 `TotalsSummary` — ya se corrigió en v7.152.0.
- 4.3 gap — ya en `gap-4`.

---

## Sprints propuestos

**Sprint R6.1 (v7.153.0)** — Bloque 1 + Bloque 3
RoleGuard fix + tokens dark destructive. Tests de guard y contraste. Rápido y de mucho impacto visual.

**Sprint R6.2 (v7.154.0)** — Bloque 2 completo
Migración `get_portal_invoices` con `tipo_cambio` + normalización `toMxn` en AgingReport, RevenueReport, PortalStatement + badges de moneda + tests unitarios + ADR de la regla.

**Sprint R6.3 (v7.155.0)** — Bloque 4 aplicable + Bloque 5 aplicable
Dashboard/ListPageLayout gaps, KpiTile padding+clamp, `PortalInvoiceDetail -mt-2`, header sticky, `CONTROL_HEIGHT`, `RecurringBillingBadge` timezone.

**Diferido a R7:** unificar 3 KPI cards, footers/anchos de diálogo, FAB móvil, fade de scroll, deuda acumulada (optimistic locking, `mark_started_bookings_rented` en types, `.env`, N+1 signed URLs, formatters duplicados, CSP/PKCE).

## Verificación final

`bunx tsgo`, `bunx vitest run`, `deno test supabase/functions`, `deno fmt --check`. Changelog por sprint en `public/changelog.json` + `public/changelog/vX.Y.Z.json`.

## Reglas respetadas

- No tocar: trigger de divisa, `assert_invoice_cancellable`, claim atómico REP, `prepare_payment_complement`, soft-delete, guardas de formularios.
- Migraciones con timestamps nuevos, idempotentes, SECURITY DEFINER + `SET search_path = public` + GRANTs mínimos.
