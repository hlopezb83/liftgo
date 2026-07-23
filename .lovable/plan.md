
## Verificación

Revisé los 4 hallazgos del **Grupo A** (fiscal, alto impacto) contra el código actual:

| # | Hallazgo | Estado en código v7.208.0 | ¿Bug real? |
|---|---|---|---|
| A1 | `get_income_statement` suma USD como MXN | Última migración (`20260720033826_...sql`) **no menciona `tipo_cambio`** en ninguna parte | ✅ Sí |
| A2 | `get_portal_invoices` resta NCs en borrador | Migración `20260721183915_...sql` línea 56: `AND status <> 'cancelled'` (no filtra `cfdi_status='stamped'`) | ✅ Sí |
| A3 | `PortalInvoiceDetail` ignora `credited_amount` | Línea ~70: `const balance = Number(invoice.total) - totalPaid;` sin restar créditos | ✅ Sí |
| A4 | `cashFlowTransformers.invoiceToItem` ignora NCs | `const balance = totalMxn - (paidByInvoice.get(inv.id) ?? 0);` sin `credited_amount` | ✅ Sí |

Los 4 son bugs reales confirmados. Grupos B (permisos/UX) y C (arquitectura) los verificaré en tandas subsiguientes antes de tocarlos.

## Alcance de este plan — sólo Grupo A (v7.209.0)

### A1 — `get_income_statement` multi-moneda
Nueva migración que redefine el RPC multiplicando **cada** agregado por `COALESCE(NULLIF(i.tipo_cambio,0), 1)`:
- `SUM(i.subtotal * TC)`, `SUM(i.total * TC)`, `SUM(i.iva_total * TC)` en la CTE de invoices.
- Mismo tratamiento en credit_notes y pagos que participen del RPC (usar el `tipo_cambio` del documento propio).
- Etiquetar el output como MXN (comentario en header + rename ninguno; los consumidores ya lo tratan como MXN).
- Copiar `SET search_path = public`, `SECURITY DEFINER`, grants existentes. Header `-- === CANONICAL ===` (adelanta DIFF C7).
- **Fixture de test:** en `src/features/reports/hooks/incomeStatement/*` o test SQL — 1 factura USD 431.03 @ TC 20 en marzo → mes = 8,620.60 MXN.

### A2 — `get_portal_invoices` NCs sólo timbradas
Nueva migración: cambiar la subconsulta de NCs de `AND status <> 'cancelled'` a `AND cfdi_status = 'stamped'` (alinea con vista interna `v_invoices_with_balance`).
- Header `-- === CANONICAL ===`.
- Test: agregar caso en tests del portal (NC borrador + timbrada) verificando paridad de saldo portal↔admin.

### A3 — `PortalInvoiceDetail.tsx`
```diff
- const balance = Number(invoice.total) - totalPaid;
+ const balance = Number(invoice.total) - totalPaid - Number(invoice.credited_amount ?? 0);
```
Verificar que el RPC ya devuelve `credited_amount` (lo asume el reporte); si no, incluirlo en el `SELECT` del RPC en la misma migración A2.

### A4 — `cashFlowTransformers.invoiceToItem`
- Extender `InvoiceRow` con `credited_amount: number | string | null` y `credited_amount_mxn` opcional.
- Restar `toMxn(Number(inv.credited_amount ?? 0), inv.moneda, inv.tipo_cambio)` al balance.
- Actualizar el fetcher upstream (`useCashFlowProjection` / query de facturas) para incluir `credited_amount` en el `select`.
- Ajustar/añadir test en `src/features/cash-flow/**/__tests__` cubriendo el caso NC 6,000 timbrada.

## Detalles técnicos

- Ninguna migración toca schemas prohibidos (`auth`, `storage`, etc.).
- Todas las nuevas migraciones incluyen `SET search_path = public` y mantienen grants existentes vía `CREATE OR REPLACE`.
- Bump a **v7.209.0** (minor: cambio de comportamiento del reporte fiscal): entrada en `public/changelog.json` + detalle en `public/changelog/v7.209.0.json`.
- Verificación: `bun run test` (nuevos casos), `bunx tsgo` para tipos, `bun run build`, `scripts/arch-check.sh`.

## Fuera de alcance (siguientes turnos)

- Grupo B (RoleGuards, isPending CRM, dedupe utilización, secciones OT) — pediré aprobación con verificación al terminar Grupo A.
- Grupo C (arquitectura, tests, limpieza) — plan aparte por lote.

¿Aplico el Grupo A completo como v7.209.0?
