
# Plan v7.226.0 — Auditoría E2E: diffs pendientes N4–N13

## Contexto
En v7.225.0 ya se cerraron N1 (RPC `complete_return_inspection` con las 4 condiciones + minor/major), N2 (saldo del portal NC-aware en `PortalInvoicePayment`), N3 (`RoleGuard` en CTAs de Fleet/Quotes/Contracts/Customers) y N11 (motivo de cancelación en `cancel_booking` + diálogo). Antes de tocar cada uno, releeré esos archivos para confirmar que la implementación actual cumple los criterios de aceptación del documento; si algo falta, lo completo bajo la misma versión.

N12 es "no es bug" — solo test aclaratorio opcional (lo incluyo).

## Alcance de código (por diff)

**N4 · Contrato desde reserva auto-genera terms_text**
- `src/features/contracts/hooks/useContractFormLogic.ts`: incluir `bookingForkliftId` (obtenido del booking cargado por `bookingId`) en el filtro de forklifts junto a `available` y `currentId`.
- Verificar que `useContractFormPrefill` se dispara una vez la lista incluye ese forklift; ajustar dependencias si hace falta.

**N5 · Invalidar branding público al guardar company_settings**
- `src/features/company-settings/lib/queryKeys.ts`: reordenar para declarar `publicBrandingQueries` antes de `COMPANY_SETTINGS_INVALIDATION_KEYS` y añadirlo al arreglo.

**N6 · Ocultar "Registrar Pago" en factura saldada por NC**
- `src/lib/rules/invoices.ts`: introducir `balance` opcional en `InvoiceLike`, calcular `hasBalance`, aplicar a `isPayable` y `showPaymentBtn`.
- Call site del detalle de factura: pasar `balance` (ya calculado NC-aware) a `computeInvoiceFlags`.

**N7 · Validar email en InviteUserDialog**
- `src/features/users/components/users/InviteUserDialog.tsx`: schema Zod inline, estado `emailError`, mensaje inline bajo el input, bloquear submit si inválido.

**N8 + N10 · Sidebar Auditoría gestionable**
- `src/layouts/sidebar/navConfig.ts`: quitar `/audit` y `/activity` de `ALWAYS_VISIBLE_ROUTES`, mapearlas en `ROUTE_TO_MODULE` al módulo "Auditoría".
- `src/features/users/hooks/useRolePermissions.ts`: agregar "Auditoría" al catálogo de módulos gestionables.
- Migración: seed `role_permissions` (admin, administrativo → full) con `ON CONFLICT DO NOTHING`.

**N9 · Botón Actualizar en Calendario/Gantt**
- `src/features/calendar/pages/CalendarPage.tsx`: botón que invalida `bookingKeys.all` con ícono y `aria-label`.

**N12 · Test aclaratorio (opcional)**
- Añadir caso "1 jul → 31 jul = 1 mes exacto" en `rentalCalculation.test.ts`.

**N13 · Persister no persiste queries pending**
- `src/lib/query/persister.ts`: en `shouldPersistQuery`, `return false` si `query.state.status === "pending"`.

## Verificación
- Re-lectura de N1/N2/N3/N11 para confirmar cumplimiento vs. el nuevo documento.
- `bunx tsgo` sobre archivos tocados y `bunx vitest run` de suites afectadas (invoices/lib, rentalCalculation, portal si aplica).
- Sin cambios visuales fuera del botón Actualizar del calendario y el mensaje inline del InviteUserDialog.

## Entregables finales
- Bump a **v7.226.0** en `package.json`, `version.json`, `src/lib/changelog.ts`, `public/changelog.json` y nuevo `public/changelog/v7.226.0.json` con las entradas N4–N10, N12, N13.
