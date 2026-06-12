---
name: Invoice Balance Source of Truth
description: Single SQL view + hook for all invoice balance/aging/forecast calculations
type: feature
---
Toda lógica de saldo de factura (cartera vencida, pronóstico de cobranza, dashboard, aging) consume:
- Vista SQL `v_invoices_with_balance` (security_invoker, calcula `paid_amount` y `balance = GREATEST(total - paid, 0)`)
- Hook `useInvoicesWithBalance` en `src/features/invoices/hooks/invoices/`
- RPCs `get_financial_kpis()` y `get_dashboard_stats()` consumen la vista

PROHIBIDO recalcular `balance = total − Σ payments.amount` ad-hoc en hooks o componentes; introduce divergencia entre vistas y reintroduce el bug de pagos parciales (fix v6.44.8/v6.45.0).
