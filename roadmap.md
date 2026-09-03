# Roadmap — 9 bugs pendientes (YAGNI estricto)

Restricciones: no tocar datos históricos (FAC-0113, ENT-0027, ENT-0028/0029/0031/0032/0033), CFDI timbrados, importes, pagos ni estados existentes. Sin dependencias nuevas ni rediseños.

## Tareas
- [ ] 1. Entregas `completed` sin `completed_at`: reloj de servidor en toda transición + protección prospectiva en DB (compatible con ENT-0027).
- [ ] 2. `completed_at` < `created_at`: dejar de calcular en navegador; usar tiempo de transacción del servidor.
- [ ] 3. Evidencia operativa: `completed_at` automático; horómetro obligatorio solo si el equipo lo usa (si hay indicador confiable); advertencia + justificación al completar sin operador/firma (campo mínimo nullable si hace falta).
- [ ] 4. Período de facturación inicial: usar función canónica en creación inicial y recurrente; pruebas mitad de mes/fin de mes/cambio de mes/Monterrey; sin cambiar política comercial ni FAC-0113.
- [ ] 5. Factura agrupada multi-reserva: reutilizar relación existente (`invoice_bookings` ya existe); idempotencia por reserva+período; lecturas prefieren relación múltiple con fallback a `booking_id`.
- [ ] 6. Dashboard ceros falsos: KPIs financieros distinguen loading (skeleton/—), error ("No disponible"+reintento) y cero real.
- [ ] 7. "Búsqueda global" → texto "Ir a…", nombre accesible "Navegación rápida"; conservar Ctrl+K.
- [ ] 8. Pestañas de Cotizaciones: solo copy visible (Todas, Borradores, Enviadas, Aceptadas, Convertidas, Rechazadas, Expiradas, Canceladas).
- [ ] 9. Cuentas bancarias: aria-label contextual, tooltip y área táctil consistente en botones de icono.

## Validación
- [ ] Migraciones prospectivas que preservan inconsistencias históricas.
- [ ] Pruebas unitarias: reloj/estado de entregas, confirmación sin evidencia, períodos/idempotencia, KPI loading/error/zero, textos accesibles.
- [ ] Build + typecheck + lint + suites relacionadas.
- [ ] Verificación visual: Dashboard, Entregas, Cotizaciones, navegación rápida, Cuentas bancarias.
- [ ] RLS de objetos nuevos revisado.
- [ ] Changelog actualizado.
