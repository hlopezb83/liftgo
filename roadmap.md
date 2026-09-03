# Roadmap — 9 bugs pendientes (YAGNI estricto)

Restricciones: no tocar datos históricos (FAC-0113, ENT-0027, ENT-0028/0029/0031/0032/0033), CFDI timbrados, importes, pagos ni estados existentes. Sin dependencias nuevas ni rediseños.

## Tareas
- [x] 1. Entregas `completed` sin `completed_at`: reloj de servidor en toda transición + protección prospectiva en DB (compatible con ENT-0027). → trigger `trg_set_delivery_completed_at`.
- [x] 2. `completed_at` < `created_at`: dejar de calcular en navegador; usar tiempo de transacción del servidor. → el cliente ya no envía `completed_at`.
- [x] 3. Evidencia operativa: advertencia + justificación (`completed_no_evidence_reason`) al completar sin operador/firma, en detalle, alta histórica y post-reserva.
- [x] 4. Período de facturación inicial: `prefillBillingPeriod` siempre acota a las fechas de la reserva (incluida recurrente que termina en su mes inicial); pruebas mitad/fin de mes, cambio de mes/año y TZ; FAC-0113 intacta.
- [x] 5. Factura agrupada multi-reserva: RPC atómico `sync_invoice_bookings` (delete+insert en una transacción) con idempotencia reserva+período (pivote y `booking_id` legado).
- [x] 6. Dashboard ceros falsos: `financialSectionState` distingue error ("No disponible"+reintento), loading (skeleton) y cero real.
- [x] 7. "Búsqueda global" → "Navegación rápida" / "Ir a…"; Ctrl+K conservado.
- [x] 8. Pestañas de Cotizaciones en plural (`QUOTE_STATUS_TAB_LABELS`); badges siguen en singular.
- [x] 9. Cuentas bancarias: aria-label contextual, tooltip y botones `iconSm` en la tabla desktop.

## Validación
- [x] Migraciones prospectivas que preservan inconsistencias históricas (ENT-0027 NULL y desfases 0028/29/31/32/33 intactos; verificado en DB).
- [x] Pruebas unitarias: 77 pruebas en 7 suites (payload/justificación, schema, RPC, períodos, KPI states, labels).
- [x] Pruebas transaccionales en DB (con rollback): trigger T1/T2 y RPC T3/T4/T5 pasaron; sin residuos.
- [x] Build + typecheck + lint + suites relacionadas (advertencias de lint restantes son preexistentes en archivos no tocados).
- [x] Verificación visual: Dashboard, Entregas, Cotizaciones, navegación rápida, Cuentas bancarias.
- [x] RLS de objetos nuevos revisado (RPC `SECURITY INVOKER`; grants a `authenticated`/`service_role`).
- [x] Changelog actualizado (v7.422.0).
