

# Evaluacion de lo Implementado y Nuevas Mejoras

## Lo que YA esta implementado (del plan anterior)

| Mejora | Estado |
|--------|--------|
| 1. KPIs Financieros (MRR, DSO, Utilización, Cartera Vencida) | Implementado -- `FinancialKpiCards` en Dashboard |
| 2. Rentabilidad por Equipo | Implementado -- `ForkliftFinancialCard` + `get_forklift_financials` RPC |
| 4. Contratos por Vencer | Implementado -- `ExpiringContractsAlert` con `get_financial_kpis` RPC |
| 5. Ubicación Actual de Equipos | Implementado -- `ForkliftSpecsCard` muestra ubicación desde contrato/entrega |
| 9. Historial de Horómetro | Implementado -- `ForkliftHourometerHistory` con datos de `get_forklift_financials` |

## Lo que NO se ha implementado

| # | Mejora | Estado |
|---|--------|--------|
| 3 | Seguimiento de Cobranza | No implementado |
| 6 | Costos de Transporte en Entregas | No implementado |
| 7 | Extensión de Reservas | No implementado |
| 8 | Seguro por Equipo | No implementado |
| 10 | Notificaciones por Correo | No implementado |

---

## Nuevas Recomendaciones de Mejora (Post-evaluación)

### 1. Seguimiento de Cobranza Estructurado (Pendiente del plan original)

**Problema:** Las facturas vencidas se muestran en AlertsRow pero solo permiten "Marcar Pagada" de un clic. No hay registro de gestiones intermedias (llamadas, promesas de pago, correos).

**Recomendación:** Crear tabla `collection_notes` (invoice_id, note, next_followup_date, created_at, created_by) y agregar una sección de "Gestiones de Cobranza" en `InvoiceDetail`. Mostrar en dashboard un contador de "Facturas sin seguimiento reciente" (>7 dias sin nota).

**Justificación:** La cobranza requiere trazabilidad. Sin ella, no se sabe quién contactó al cliente ni cuándo.

**Implementación:**
- Migración SQL: tabla `collection_notes` con RLS
- Componente `CollectionNotesCard` en InvoiceDetail
- Alerta en dashboard para facturas sin seguimiento reciente

---

### 2. Costos de Transporte en Entregas (Pendiente del plan original)

**Problema:** La tabla `deliveries` no tiene campos de costo logístico. Cada movimiento (entrega/recolección) tiene un flete que no se rastrea.

**Recomendación:** Agregar columnas `transport_cost` (numeric) y `charged_to_customer` (boolean) a `deliveries`. Mostrar en el formulario de nueva entrega y en el detalle.

**Justificación:** Los costos de flete pueden representar 5-15% del ingreso por renta. Sin visibilidad, se erosiona el margen.

**Implementación:**
- Migración SQL: ALTER TABLE deliveries ADD transport_cost, charged_to_customer
- Actualizar formulario en DeliveriesPage
- Mostrar en DeliveryDetail

---

### 3. Extensión de Reservas con Trazabilidad (Pendiente del plan original)

**Problema:** No hay forma de extender una reserva sin editar fechas manualmente. No queda registro de la fecha original ni del motivo.

**Recomendación:** Crear tabla `booking_extensions` (booking_id, original_end_date, new_end_date, reason, created_at). Agregar botón "Extender Renta" en BookingDetail que abra un diálogo, actualice el end_date de la reserva, y registre la extensión.

**Justificación:** Las extensiones son frecuentes. Sin registro, se pierde visibilidad sobre compromisos de disponibilidad y se complica la facturación.

**Implementación:**
- Migración SQL: tabla `booking_extensions` con RLS
- Componente `ExtendBookingDialog` en BookingDetail
- Historial de extensiones visible en BookingDetail

---

### 4. Seguro por Equipo (Pendiente del plan original)

**Problema:** No hay campos para rastrear pólizas de seguro. El formulario de equipo (`ForkliftForm`) solo registra specs técnicas y tarifas.

**Recomendación:** Agregar columnas a `forklifts`: `insurance_provider`, `insurance_policy_number`, `insurance_expiry`, `insurance_cost`. Mostrar en ForkliftSpecsCard. Crear alerta en dashboard para pólizas por vencer (<30 dias).

**Justificación:** Un montacargas sin seguro vigente en sitio de un cliente es un riesgo legal y financiero significativo.

**Implementación:**
- Migración SQL: ALTER TABLE forklifts ADD insurance fields
- Actualizar ForkliftForm y ForkliftSpecsCard
- Agregar alerta de pólizas por vencer en dashboard

---

### 5. Indicador de Rentabilidad por Cliente

**Problema:** `CustomerDetailPage` muestra total facturado y pagado, pero no muestra la rentabilidad real por cliente (ingresos vs. costos de mantenimiento de los equipos que ha rentado).

**Recomendación:** En `CustomerFinancialSummary`, cruzar las facturas del cliente con los costos de mantenimiento de los equipos durante sus periodos de renta. Mostrar margen bruto por cliente.

**Justificación:** Permite identificar clientes de alto volumen pero baja rentabilidad (ej. por daños frecuentes o uso excesivo).

**Implementación:**
- RPC `get_customer_profitability(p_customer_id)` que cruce invoices + maintenance_logs por periodo de booking
- Actualizar `CustomerFinancialSummary` con margen bruto

---

### 6. Reporte de Antigüedad de Cartera (Aging Report)

**Problema:** El dashboard muestra aging buckets (0-30, 31-60, 61-90, 90+) en el AlertsRow, pero no hay un reporte detallado dedicado a cartera que permita exportar y analizar.

**Recomendación:** Agregar un nuevo tipo de reporte "Antigüedad de Cartera" en ReportsPage que muestre cada factura vencida con: cliente, monto, dias de atraso, última gestión de cobranza, y totales por bucket. Con exportación CSV.

**Justificación:** Este reporte es estándar en cualquier operación de crédito y cobranza. El director necesita compartirlo con su equipo de cobranza semanalmente.

**Implementación:**
- Nuevo componente `AgingReport` en src/components/reports/
- Agregar opción al selector de ReportsPage
- Query a invoices WHERE status IN ('sent','overdue') con joins

---

### 7. Ubicación de Equipos en la Lista de Flota

**Problema:** La ubicación actual solo se muestra en ForkliftDetail. En la lista de flota (`Fleet.tsx`), no hay columna de ubicación, lo que obliga a entrar equipo por equipo.

**Recomendación:** Agregar columna "Ubicación" en la tabla de flota que muestre la dirección del contrato activo o última entrega. Útil para planificación logística rápida.

**Justificación:** El dispatcher necesita ver de un vistazo dónde está cada equipo para coordinar fletes y servicios.

**Implementación:**
- RPC o query que traiga ubicación por equipo (batch, no N+1)
- Agregar columna a Fleet.tsx table

---

### 8. Campo de Contacto de Emergencia por Equipo/Sitio

**Problema:** Cuando un equipo tiene una falla en sitio, no hay forma rápida de saber quién es el contacto operativo en la ubicación (puede ser diferente al contacto administrativo del cliente).

**Recomendación:** Agregar campo `site_contact_name` y `site_contact_phone` en bookings o contracts. Mostrar en BookingDetail y ForkliftDetail cuando el equipo está rentado.

**Justificación:** Reduce tiempo de respuesta ante emergencias operativas.

**Implementación:**
- ALTER TABLE bookings ADD site_contact_name, site_contact_phone
- Actualizar BookingForm y BookingDetail

---

## Prioridad Recomendada

| # | Mejora | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Seguimiento de Cobranza | Alto | Medio |
| 6 | Reporte de Antigüedad de Cartera | Alto | Bajo |
| 4 | Seguro por Equipo | Alto | Bajo |
| 2 | Costos de Transporte | Medio | Bajo |
| 3 | Extensión de Reservas | Medio | Medio |
| 5 | Rentabilidad por Cliente | Medio | Medio |
| 7 | Ubicación en Lista de Flota | Medio | Medio |
| 8 | Contacto de Emergencia | Bajo | Bajo |

