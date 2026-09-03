# Roadmap

## Revisión de regresión v7.422.0 (en curso — NO publicar)
Restricciones: no tocar datos históricos (FAC-0113, ENT-0027, ENT-0028/0029/0031/0032/0033), CFDI timbrados, importes, pagos ni estados. YAGNI estricto; sin tabla ledger ni rearquitectura.

- [ ] P1 Atomicidad extremo a extremo: crear/editar factura + pivote `invoice_bookings` en UNA transacción de BD (RPC `save_invoice_with_bookings`), con candados advisory por todos los bookingIds ordenados usando la misma clave que `create_recurring_invoice`, y chequeo de duplicados reserva+período DESPUÉS de adquirirlos. `sync_invoice_bookings` también toma los candados. Conservar bloqueo optimista (`expectedVersion`/stale_write), permisos, `booking_id` legado y regla canónica de cancelación.
- [ ] P2 Multi-selección coherente: sólo reservas del mismo cliente + misma moneda/TC + exactamente el mismo periodo canónico (`prefillBillingPeriod`/`firstBillingPeriod`); deshabilitar incompatibles con razón breve; validar lo mismo al guardar (no sólo filtro visual). Sin conversión automática de monedas.
- [ ] P3 Validación de periodo: `billingPeriodEnd` requerido con reserva, `start <= end`, y periodo dentro del rango de TODAS las reservas seleccionadas — en cliente y en servidor (RPC transaccional). Sin fallback silencioso a un mes ajeno.
- [ ] Pruebas obligatorias: (1) concurrencia real — sólo un intento persiste y el perdedor no deja factura; (2) fallo de sync en creación/edición revierte todo; (3) multi-select rechaza periodo/moneda/TC distintos y acepta compatibles; (4) periodEnd requerido, start<=end, periodo fuera de reserva rechazado; (5) regresión simple/recurrente/extensión/daño/edición y FAC-0113 intacta; (6) typecheck + suite completa.
- [ ] Changelog MD + JSON + versión; reportar commit, migración, versión y conteo de pruebas. NO publicar.

## Cerrado — 9 bugs pendientes (v7.422.0)
- [x] 1-3 Entregas: reloj de servidor (`trg_set_delivery_completed_at`), sin `completed_at` de cliente, justificación de evidencia (`completed_no_evidence_reason`). Históricos intactos.
- [x] 4 Período inicial: `prefillBillingPeriod` acotado a la reserva.
- [x] 5 Factura agrupada: RPC `sync_invoice_bookings` (superseded por P1 arriba).
- [x] 6 Dashboard: estados loading/error/cero real.
- [x] 7 "Navegación rápida" / "Ir a…".
- [x] 8 Pestañas de Cotizaciones en plural.
- [x] 9 Cuentas bancarias accesibles (aria-label, tooltip, iconSm).
