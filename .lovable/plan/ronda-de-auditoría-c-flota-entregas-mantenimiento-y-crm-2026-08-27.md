# Ronda de auditoría C — Flota, Entregas, Mantenimiento y CRM

Nueva ronda sobre módulos que no se habían revisado a fondo. Cada hallazgo de abajo fue verificado contra la base de datos o el código real.

## Hallazgos verificados

### C1 — Unidades atrapadas en "Rentada" (crítico, operativo)
Hay 2 montacargas (MCLTC025A048/012 y /005) marcados como "rentada" cuyas reservas terminaron el 25 de agosto y siguen en estado "confirmada". No existe ningún proceso que cierre reservas vencidas ni que devuelva la unidad a "disponible": los disparadores actuales sólo reaccionan cuando alguien edita la reserva a mano. Resultado: unidades que ya regresaron al patio no se pueden rentar y los KPIs de utilización quedan inflados.

Solución: una función de reconciliación diaria que marque como "completada" toda reserva confirmada/activa cuya fecha de fin ya pasó (sin inspección de retorno pendiente) y recalcule el estatus de la unidad, más una corrección puntual de los 2 registros actuales.

### C2 — Entregas: 25 entregas vencidas invisibles (alto, UX)
Las 25 entregas en estado "programada" tienen fecha anterior a hoy y la lista no lo indica de ninguna forma: no hay aviso de atraso, ni filtros por estado o tipo, ni orden que priorice lo vencido. Además la tabla de escritorio no muestra la columna "Tipo" (entrega vs. recolección) — ese dato sólo aparece en la tarjeta móvil, así que en escritorio es imposible distinguirlas.

Solución: agregar columna "Tipo", indicador "Vencida" con días de atraso, filtros por estado y tipo, y un aviso arriba de la lista con el conteo de entregas atrasadas.

### C3 — Métricas de CRM calculadas con el reloj del navegador (medio)
El corte "del mes" y "últimos 30 días" del CRM se calcula con la hora local de la computadora del usuario. Igual que el bug B4 de cotizaciones, una máquina con zona horaria o fecha incorrecta muestra cifras de mes distintas a las del resto del sistema.

Solución: usar el reloj de Monterrey (`nowMty()`), como ya se hizo en cotizaciones y contratos.

### C4 — Fechas "no futuras" con reloj del navegador (bajo)
Los selectores de fecha de pago (registro y edición de pagos, pago a proveedor) y el año del CFDI global bloquean el futuro usando la fecha del navegador. Un equipo adelantado deja capturar un pago con fecha futura, que el servidor sí acepta.

Solución: derivar el tope de esos selectores del mismo reloj de Monterrey.

## Alcance técnico

- Migración SQL: función `reconcile_expired_bookings()` con `SET search_path = public`, guard de rol y cierre transaccional; corrección puntual de las 2 reservas/unidades vencidas. Sin tablas nuevas.
- `src/features/deliveries/pages/DeliveriesPage.tsx` + un helper nuevo `lib/deliveryOverdue.ts`: columna tipo, badge de vencida, filtros vía `useTableFilters`, aviso de atrasadas.
- `src/features/crm/hooks/useCRMMetrics.ts`: reemplazar `new Date()` por `nowMty()`.
- Selectores de fecha en `RegisterSupplierPaymentDialog`, `RecordPaymentDialog`, `EditPaymentDialog`, `GlobalInvoiceFields`.
- Pruebas nuevas para el helper de entregas vencidas y para el corte mensual del CRM; se corre la suite existente.
- Changelog y versión: `v7.363.0` (minor).

## Fuera de alcance
Mantenimiento quedó limpio en esta revisión: los costos (partes, mano de obra y costo manual) se recalculan por disparadores en la base de datos y el inventario tiene candados de stock no negativo. No hay cambios propuestos ahí.
