# Plan: Cierre de pendientes R17 (Q, U, V, X#1)

## Objetivo
Aplicar los 4 hallazgos de R17 que quedaron fuera del sprint anterior, verificar visualmente y actualizar changelog.

---

## 1. R17-Q · Etiqueta correcta para contrato `sent`

**Problema:** `STATUS_LABELS.sent = "Sin Pagar"` es global y se usa para facturas; en contratos `sent` debería ser "Enviado".

**Cambios:**
- Crear `src/features/contracts/lib/contractStatusLabels.ts` que extienda `STATUS_LABELS` y sobreescriba `sent → "Enviado"` y `signed → "Firmado"`.
- Reemplazar el uso de `STATUS_LABELS` por `CONTRACT_STATUS_LABELS` en:
  - `src/features/contracts/hooks/contractDetail/useContractDetailLogic.ts` (toast de cambio de estado).
  - `src/features/contracts/pages/ContractsPage.tsx` (tabs de filtro y `StatusBadge` ya recibe el status raw, no necesita cambio).

**Verificación:** Marcar un contrato como enviado → toast y badge muestran "Enviado".

---

## 2. R17-U · Indicador de moneda en el portal

**Problema:** El portal cliente muestra todos los montos como MXN, aunque la factura sea USD.

**Cambios:**
- En `src/features/portal/pages/PortalInvoices.tsx` reemplazar `formatCurrency` por `formatCurrencyWithCode(..., inv.moneda ?? "MXN")` en tabla y mobile card.
- En `src/features/portal/pages/PortalInvoiceDetail.tsx` reemplazar `formatCurrency` por `formatCurrencyWithCode(..., invoice.moneda ?? "MXN")` en cards de Total/Pagado/Saldo, partidas y pagos.
- Actualizar imports para incluir `formatCurrencyWithCode`.

**Verificación:** Factura USD en portal lista y detalle muestra "USD" junto al monto.

---

## 3. R17-V · Gate de roles en detalle de equipo

**Problema:** `ForkliftDetail` expone Editar/Archivar a cualquier rol; solo debe verlos quien tenga acceso "full" al módulo Flota.

**Cambios:**
- En `src/features/fleet/pages/ForkliftDetail.tsx` envolver los botones "Editar" y "Archivar" con `<RoleGuard module="Flota" minAccess="full" fallback={null}>`.
- Aplicar el mismo gate a `<StatusChangeCard>` si el rol no tiene permiso de escritura en Flota (mismo patrón que `FleetPage.tsx`).
- Importar `RoleGuard` desde `@/layouts/RoleGuard`.

**Verificación:** Usuario con rol Mecánico/Despachador en detalle de equipo → no ve Editar/Archivar ni Cambiar Estado. Admin/Adminstrativo sí los ve.

---

## 4. R17-X#1 · Proyección de flujo con saldo de $0.01

**Problema:** `cashFlowTransformers.ts` descarta balances `<= 0.01`, por lo que un saldo de 1 centavo no se proyecta.

**Cambios:**
- En `src/features/cash-flow/lib/cashFlowTransformers.ts` cambiar:
  - Línea 69: `if (balance <= 0.01) return null;` → `if (balance < 0.005) return null;`
  - Línea 95: `balanceMxn <= 0.01` → `balanceMxn < 0.005`

**Verificación:** Factura o bill con saldo de `$0.01` aparece en la proyección de flujo de efectivo.

---

## 5. Versionado y changelog

- Bump a `v7.237.2` (patch por correcciones focalizadas).
- Agregar entrada en `public/changelog.json` y detalle en `public/changelog/v7.237.2.json`.

---

## Verificación final

- `bun run lint` sin errores.
- `bunx vitest run` pasa.
- Revisión visual rápida de: detalle de contrato, portal facturas, detalle de equipo y proyección de flujo.
