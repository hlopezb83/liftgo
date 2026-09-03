# Roadmap

## Cerrado — Revisión de regresión v7.422.0 → v7.423.0 (validada; NO publicada por instrucción)
Restricciones respetadas: datos históricos intactos (FAC-0113 hash/versión verificados, ENT-0027, ENT-0028/0029/0031/0032/0033), CFDI timbrados, importes, pagos y estados sin cambios. YAGNI; sin tabla ledger ni rearquitectura.

- [x] P1 Atomicidad extremo a extremo: RPC `save_invoice_with_bookings` (SECURITY INVOKER) crea/edita factura + pivote en UNA transacción; `lock_bookings_for_billing` toma candados advisory por booking ordenados con la MISMA clave md5/60-bits que `create_recurring_invoice` (paridad verificada en pg_locks); duplicados reserva+período chequeados DESPUÉS de los candados; `sync_invoice_bookings` endurecido igual. `expectedVersion`/stale_write, permisos, `booking_id` legado y regla de canceladas intactos.
- [x] P2 Multi-selección coherente: `bookingCompatibility.ts` (cliente + moneda/TC + periodo canónico); selector deshabilita incompatibles con razón; `validateSelection` re-valida al guardar; servidor re-valida en el RPC. Sin conversión de monedas.
- [x] P3 Validación de periodo: `billingPeriodEnd` requerido con reserva, start ≤ end, y periodo dentro del rango de TODAS las reservas — schema Zod + guard del RPC. El fallback a mes de emisión quedó inalcanzable (schema exige ambos extremos) y el servidor rechaza cualquier periodo fuera de rango.
- [x] Pruebas obligatorias contra la BD real (fixtures 2031 "BORRAR", limpiados):
  (1) 4 POST simultáneos misma reserva+período → 1 éxito, 3×23505 sin residuos; carrera de reserva SECUNDARIA compartida → 1 éxito, perdedor 23505 sin factura.
  (2) Edición con reserva duplicada → rechazo y rollback total (la versión NO se consumió: edición válida posterior pasó con la misma expectedVersion); stale_write con versión obsoleta OK.
  (3) Multi-select: cubierto por unit tests de `bookingCompatibility` (cliente/moneda/TC/periodo).
  (4) Servidor: fin<inicio, fuera de rango y sin fin → 23514 con mensaje claro; periodo válido → 200.
  (5) FAC-0113: hash `11a72a…`/pivote `c9c8a…`/versión 6 idénticos antes y después. Nota: re-guardar FAC-0113 con su periodo histórico fuera de rango ahora lo rechaza el servidor (regla nueva intencional); sus datos no se tocaron.
  (6) Typecheck OK + suite completa (ver reporte del turno).
- [x] Changelog MD + JSON + version.json → 7.423.0. Migración: `20260903215543_3f0d73fb-b8e1-4620-9e06-42f4ffe7af0d.sql`. NO publicado.

## Cerrado — 9 bugs pendientes (v7.422.0)
- [x] 1-3 Entregas: reloj de servidor (`trg_set_delivery_completed_at`), sin `completed_at` de cliente, justificación de evidencia (`completed_no_evidence_reason`). Históricos intactos.
- [x] 4 Período inicial: `prefillBillingPeriod` acotado a la reserva.
- [x] 5 Factura agrupada: RPC `sync_invoice_bookings` (superseded por P1 arriba).
- [x] 6 Dashboard: estados loading/error/cero real.
- [x] 7 "Navegación rápida" / "Ir a…".
- [x] 8 Pestañas de Cotizaciones en plural.
- [x] 9 Cuentas bancarias accesibles (aria-label, tooltip, iconSm).
