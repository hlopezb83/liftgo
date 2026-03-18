

# Análisis Estratégico — Mejoras para LiftGo

Después de revisar la aplicación completa, presento las siguientes recomendaciones priorizadas desde la perspectiva de un Director General de una empresa de renta de montacargas.

---

## 1. KPIs Financieros Faltantes en el Dashboard

**Problema:** El panel muestra conteos de flota y facturas vencidas, pero no presenta métricas financieras clave que un director necesita ver a diario.

**Recomendación:** Agregar tarjetas con:
- **Ingreso mensual recurrente (MRR)** — suma de rentas activas mensualizadas
- **Tasa de utilización de flota (%)** — equipos rentados / equipos activos
- **Días promedio de cobro (DSO)** — días promedio entre emisión de factura y pago
- **Valor de cartera vencida** — ya existe en alertas pero merece una tarjeta prominente

**Justificación:** Son los 4 indicadores que determinan la salud financiera del negocio de renta. Sin ellos, el director no puede tomar decisiones informadas sobre expansión de flota o políticas de cobranza.

---

## 2. Rentabilidad por Equipo Individual

**Problema:** Existe un reporte de "Rentabilidad por Modelo" pero no hay visibilidad de rentabilidad por unidad específica. Dos montacargas del mismo modelo pueden tener resultados muy diferentes según su historial de mantenimiento y tiempo de inactividad.

**Recomendación:** En el detalle de cada equipo (`ForkliftDetail`), agregar una card de "Resumen Financiero" que muestre:
- Ingresos totales generados (suma de facturas vinculadas)
- Costos de mantenimiento acumulados
- Margen bruto y ROI vs. costo de adquisición
- Días rentado vs. días disponible (tasa de utilización individual)

**Justificación:** Permite identificar equipos que deben venderse o reemplazarse por bajo rendimiento, y justificar decisiones de CAPEX.

---

## 3. Seguimiento de Cobranza Estructurado

**Problema:** Las facturas vencidas aparecen como alertas en el dashboard, pero no hay un flujo de seguimiento de cobranza (promesas de pago, recordatorios enviados, gestión de cartera).

**Recomendación:** Agregar al detalle de factura:
- Historial de gestiones de cobranza (llamadas, correos, promesas de pago)
- Fecha de próximo seguimiento
- En el dashboard, mostrar un indicador de "antigüedad de cartera" más detallado con tendencia mes a mes

**Justificación:** En renta de equipos, la cobranza es el principal riesgo financiero. Sin seguimiento estructurado, las cuentas por cobrar envejecen sin control.

---

## 4. Contratos por Vencer (Alerta Proactiva)

**Problema:** No existe una alerta de contratos que están próximos a vencer (30, 15, 7 días). El sistema solo alerta sobre rentas ya vencidas.

**Recomendación:** Agregar en el dashboard una sección de "Contratos por Vencer" que liste contratos activos cuyo `end_date` esté dentro de los próximos 30 días, permitiendo al equipo comercial contactar al cliente para renovación o planificar la recolección.

**Justificación:** La renovación de contratos es más barata que conseguir clientes nuevos. Sin esta visibilidad, se pierden oportunidades de retención.

---

## 5. Ubicación Actual de Cada Equipo

**Problema:** Los equipos se entregan en sitios de obra del cliente, pero no hay un campo visible de "ubicación actual" en la vista de flota ni en el detalle del equipo.

**Recomendación:** Mostrar la dirección de la última entrega activa como "Ubicación actual" en la tabla de flota y en el detalle del equipo. El dato ya existe en `deliveries.address` y en `contracts.usage_location`.

**Justificación:** Cuando un cliente reporta una falla o se necesita programar mantenimiento en sitio, saber dónde está físicamente cada equipo es crítico para la operación diaria.

---

## 6. Costos de Transporte en Entregas

**Problema:** Las entregas no registran costo de transporte (flete). Cada movimiento de equipo tiene un costo logístico que debe rastrearse para determinar si se absorbe o se cobra al cliente.

**Recomendación:** Agregar campos `transport_cost` y `charged_to_customer` (boolean) a la tabla de entregas. Mostrar un resumen de costos logísticos mensuales en el dashboard o en reportes.

**Justificación:** Los costos de flete son un gasto operativo significativo que actualmente es invisible en el sistema.

---

## 7. Renovación y Extensión de Reservas

**Problema:** No hay un flujo claro para extender una reserva existente. El usuario tendría que crear una nueva reserva o editar las fechas manualmente sin trazabilidad del cambio.

**Recomendación:** Agregar un botón "Extender Renta" en el detalle de reserva que registre la extensión con fecha original, nueva fecha, y motivo. Actualizar automáticamente el contrato vinculado.

**Justificación:** Las extensiones son frecuentes en renta de equipo industrial. Sin trazabilidad, se pierde control sobre compromisos de disponibilidad y facturación.

---

## 8. Seguro y Documentación Legal por Equipo

**Problema:** No hay campos para rastrear pólizas de seguro (número de póliza, vigencia, aseguradora, prima) por cada equipo.

**Recomendación:** Agregar una sección de "Seguro" en el detalle del equipo con campos de póliza, vigencia, aseguradora y costo. Incluir alerta cuando la póliza esté por vencer.

**Justificación:** Los montacargas son activos de alto valor. Operar sin seguro vigente expone a la empresa a pérdidas significativas por robo, daño o accidentes.

---

## 9. Historial de Horómetro Consolidado

**Problema:** Se registran lecturas de horómetro en entregas individuales, pero no hay una vista consolidada del historial de horas por equipo a lo largo del tiempo.

**Recomendación:** En el detalle del equipo, agregar una gráfica o tabla de "Historial de Horas" que muestre todas las lecturas cronológicamente y las horas acumuladas por período de renta.

**Justificación:** El desgaste del equipo se mide en horas de uso. Esta información determina cuándo programar mantenimiento preventivo y cuándo retirar un equipo.

---

## 10. Notificaciones y Recordatorios Automáticos

**Problema:** Todas las alertas son pasivas (el usuario debe entrar al dashboard para verlas). No hay notificaciones push ni por correo.

**Recomendación:** Implementar un sistema de notificaciones por correo para eventos críticos:
- Factura vencida > 7 días
- Contrato por vencer en 15 días
- Mantenimiento pendiente
- Seguro por vencer

**Justificación:** Un director y su equipo no están todo el día en el ERP. Las alertas deben llegar proactivamente para garantizar acción oportuna.

---

## Resumen de Prioridad

| # | Mejora | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | KPIs financieros en dashboard | Alto | Medio |
| 2 | Rentabilidad por equipo | Alto | Medio |
| 4 | Contratos por vencer | Alto | Bajo |
| 5 | Ubicación actual de equipos | Alto | Bajo |
| 3 | Seguimiento de cobranza | Alto | Alto |
| 6 | Costos de transporte | Medio | Bajo |
| 7 | Extensión de reservas | Medio | Medio |
| 8 | Seguro por equipo | Medio | Medio |
| 9 | Historial de horómetro | Medio | Bajo |
| 10 | Notificaciones por correo | Alto | Alto |

