# PR 6 — Flujo de caja proyectado

## Objetivo
Una vista semanal (próximas 8 semanas por default) que compara, día por día y semana por semana:
- **Entradas esperadas**: saldos de facturas (`invoices`) con `due_date` en el rango y status `sent`/`overdue`/`partially_paid`.
- **Salidas esperadas**: saldos de `supplier_bills` con `due_date` en el rango y status `pending`/`overdue`/`partially_paid`, excluyendo facturas con `approval_status` ∈ `pending`/`rejected`.
- **Neto semanal** y **saldo acumulado proyectado** partiendo de un saldo inicial editable.
- **Semáforo de liquidez** por semana: verde (acumulado > colchón), ámbar (entre 0 y colchón), rojo (negativo).

Sin nueva tabla — todo se calcula on-the-fly desde lo que ya existe. Sólo agregamos preferencias (saldo inicial y colchón) en `company_settings`.

## Ruta y navegación
- Nueva ruta `/flujo-de-caja` bajo módulo **Finanzas** en `navConfig.ts`.
- Acceso: Admin + Administrativo (lectura para Auditor).
- Entry points adicionales:
  - KPI card "Próximos 7 días" en `Dashboard` (deep-link a `/flujo-de-caja`).
  - Botón en `/cuentas-por-pagar` y `/cuentas-por-cobrar` "Ver flujo de caja".

## UI

```text
[ Saldo inicial: $___ MXN ]  [ Colchón mínimo: $___ ]  [ Horizonte: 4 / 8 / 12 sem ]   [ Exportar CSV ]

┌── KPIs ─────────────────────────────────────────────────────┐
│ Por cobrar (8 sem)  Por pagar (8 sem)  Neto    Acum. final │
└─────────────────────────────────────────────────────────────┘

┌── Tabla semanal (sticky header, zebra) ─────────────────────┐
│ Sem  Rango        Entradas  Salidas  Neto   Acum.   Estado │
│ 1    09–15 Jun    $120,000  $80,000  +40K   +60K     ●     │
│ 2    16–22 Jun     $45,000  $90,000  -45K   +15K     ●     │
│ …                                                           │
└─────────────────────────────────────────────────────────────┘

Click en una semana → panel lateral con detalle:
  · Lista de invoices que vencen esa semana (link al detalle)
  · Lista de supplier_bills que vencen esa semana (link al detalle)
```

Móvil: `MobileCardList` con una tarjeta por semana.

## Lógica de cálculo
- `nowMty()` define "hoy". Semana inicia lunes (es-MX).
- Entradas: `invoices` con `status in ('sent','overdue','partially_paid')` y `due_date` entre `monday` y `monday+8w`. Monto = `balance` (no `total`).
- Salidas: `supplier_bills` con `status in ('pending','overdue','partially_paid')`, `approval_status in ('not_required','approved')`, `due_date` en rango. Monto = `balance`.
- Vencidos (anteriores a hoy) se agrupan todos en una fila inicial **"Vencido"** para forzar acción.
- Conversión de moneda: bills/invoices en USD se convierten con `exchange_rate` del documento (ya almacenado). No hay multi-moneda en la vista — todo en MXN.
- Acumulado = saldo inicial + Σ netos hasta esa semana.
- Semáforo:
  - rojo si `acumulado < 0`
  - ámbar si `0 ≤ acumulado < colchón`
  - verde si `acumulado ≥ colchón`

## Cambios técnicos

### Migración
`ALTER TABLE public.company_settings ADD COLUMN cash_initial_balance numeric DEFAULT 0, ADD COLUMN cash_safety_buffer numeric DEFAULT 0;`
Sin nuevas tablas ni RLS.

### Hooks / código nuevo
```
src/features/cash-flow/
  hooks/useCashFlowProjection.ts        # arma la matriz semanal
  hooks/useCashFlowSettings.ts          # lee/escribe los 2 campos en company_settings
  lib/cashFlowUtils.ts                  # bucketByWeek, semáforo, formato
  components/CashFlowSummaryCards.tsx
  components/CashFlowTable.tsx
  components/CashFlowWeekDetailSheet.tsx
  components/CashFlowSettingsBar.tsx
  pages/CashFlowPage.tsx
```
Reutilizamos `useSupplierBills` (ya existe) y un nuevo `useInvoicesByDueRange` (o filtro existente en hooks de invoices).

### Tests
- `cashFlowUtils.bucketByWeek`: agrupa correctamente respetando lunes-domingo America/Monterrey.
- Semáforo: límites con `colchón=0` y `colchón>0`.
- Excluye `supplier_bills` con `approval_status='pending'` o `'rejected'`.

### Permisos
- `RoleGuard module="Cuentas por Cobrar"` y `"Cuentas por Pagar"` mínimas para abrir la página; la edición de saldo inicial/colchón requiere Admin+Administrativo.

### Changelog
`v6.31.0` (minor) — "Flujo de caja proyectado a 8 semanas con semáforo de liquidez".

## Fuera de alcance
- Pagos recurrentes proyectados (subscripciones de renta) — fase posterior.
- Escenarios "what-if" (mover fechas hipotéticamente).
- Múltiples cuentas bancarias — usamos un único saldo inicial agregado.
- Conversión FX en tiempo real — usamos `exchange_rate` ya guardado por documento.
