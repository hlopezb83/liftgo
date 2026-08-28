# Auditoría de lógica de negocio y UI/UX — Ronda E

Revisé finanzas, operaciones y la capa de interfaz. La mayoría de los patrones de riesgo (mezcla de monedas, exclusión de canceladas, límites de listado, dobles envíos) ya están cubiertos por rondas anteriores. Estos son los hallazgos reales, ordenados por severidad.

## E1 — ALTA · Archivar una orden de trabajo cerrada borra su costo

La función de base de datos que archiva mantenimientos **desactiva a propósito el candado de OT cerrada** y borra las refacciones y la mano de obra del registro. Una orden ya cerrada (y posiblemente ya facturada al cliente) puede archivarse desde la pantalla de detalle sin ningún aviso, y sus costos desaparecen de los reportes de costo por unidad.

Arreglo: bloquear el archivado cuando la OT está cerrada (salvo rol admin con confirmación explícita) y ocultar/deshabilitar el botón "Archivar" en `MaintenanceDetailSheet` para OTs cerradas, igual que ya se hace con las entregas completadas.

## E2 — ALTA · Facturas ya saldadas se pintan como pendientes

El saldo del detalle de factura se calcula sumando pagos y notas de crédito con aritmética flotante cruda (`+=` y `reduce`), sin las utilidades `sumMoney`/`roundMoney` que el propio proyecto ya usa en cartera y en el tope de notas de crédito. Cuando pagos y notas cubren el total exacto, el saldo puede quedar en `-0.0000000000002` en vez de `0`: la etiqueta "Saldo Pendiente" se pinta en rojo en una factura ya saldada.

Arreglo: usar `sumMoney`/`roundMoney` en el acumulado de pagos, en el total acreditado y en la resta final del saldo.

## E3 — MEDIA · "Cliente no encontrado" cuando en realidad falló la red

La pantalla de detalle de cliente solo distingue "cargando" y "sin datos". Si la consulta falla por red o permisos, el usuario ve "Cliente no encontrado" sin botón de reintentar, cuando el cliente sí existe.

Arreglo: exponer el estado de error del hook y mostrar el componente de error con botón de reintentar, como ya hace el detalle de entregas.

## E4 — MEDIA · Datos capturados que se pierden al cerrar un diálogo

Tres formularios con captura real no avisan de cambios sin guardar; un clic fuera del modal o Esc los descarta en silencio:

- Póliza de mantenimiento (proveedor, costo mensual, descripción)
- Crear nota de crédito (monto y motivo)
- Registrar pago a proveedor (fecha, moneda, monto, notas)

Arreglo: pasar el indicador de "formulario modificado" al diálogo, que ya soporta la confirmación de salida.

## E5 — BAJA · Corte de mes del CRM en la zona horaria del navegador

Las métricas del CRM toman el "hoy" correcto de México, pero construyen el inicio de mes y los últimos 30 días con la zona horaria de la computadora del usuario. En un equipo configurado fuera de México, el corte se desfasa unas horas y un cierre de venta puede caer en el mes equivocado.

Arreglo: construir los cortes con las mismas utilidades de fecha de negocio que ya se usan en el resto del sistema.

## Verificado sin problemas

- Conversión a pesos y exclusión de facturas canceladas/notas de crédito en cartera, cuentas por pagar, conciliación y KPIs.
- Disponibilidad y solapamiento de reservas por día calendario con la fecha del servidor.
- Monotonía del horómetro en entregas y recolecciones.
- Guards de rol y confirmación en acciones destructivas de reservas, flota, cotizaciones y prospectos.
- Botones de envío bloqueados durante el guardado (sin doble envío).
- Límites de listado con aviso de truncamiento en los listados críticos.

## Siguiente paso

Este documento es solo el reporte. Dime si quieres que implemente las correcciones (sugerido: E1 y E2 primero) y lo hago en un solo cambio con su entrada de changelog.
