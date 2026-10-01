# Correcciones de la auditoría del 30 de septiembre de 2026

Alcance: 23 hallazgos de la cola. Veinte requieren cambios de código en 8.42.32; tres ya estaban corregidos y se revalidaron en la aplicación publicada. La revisión utiliza ELOGISTIX SHIPPING como empresa de pruebas. No se incluyen credenciales ni cambios a datos históricos.

## Matriz de resolución

| ID | Prioridad | Resolución |
| --- | --- | --- |
| H01 | P1 | Bloquear costos y renglones de OT cerradas o canceladas en servidor y ocultar su edición. Comprobar ambos padres al trasladar un renglón entre OT. |
| O01 | P1 | Verificar mantenimiento y días de bloqueo en servidor, incluso cuando Despacho no puede leer las OT. Conservar permisos de Flota y Mantenimiento. |
| D01 | P1 | Completar transportes mediante una operación limitada al rol, módulo y empresa autorizados; bloquear filas en orden consistente. |
| H02 | P2 | Ventas confirma la reserva sin ofrecer un formulario de entrega que no puede guardar. Comprobar también la entrada directa al diálogo. |
| H03 | P2 | Mostrar acceso limitado en transportes cuando el rol carece de lectura; diferenciar carga, error y lista vacía. |
| O02 | P2 | Identificar el cargo por extensión como importe adicional estimado. |
| D02 | P2 | Exigir una entrega completada de la misma reserva antes de completar su recolección. |
| D03 | P2 | Impedir entregas futuras o anteriores al inicio comercial; permitir devolver equipo histórico ya entregado según la fecha real de custodia. |
| FR01 | P2 | Mantener el presupuesto separado del gasto manual real y de la mano de obra para evitar contabilizar dos veces. |
| FR02 | P2 | Notificar pagos solamente a administradores y administrativos activos con membresía interna de la empresa de la factura; utilizar su moneda. |
| FR03 | P2 | Retirar el salto de daño reportado a reparado y las acciones de archivo del flujo del mecánico. |
| MI01 | P2 | Impedir cerrar una OT con fecha futura en formulario y base de datos. |
| MI02 | P2 | Registrar el costo real de reparación al cerrar la OT; conservar ajustes manuales y distinguir cero conocido de costo pendiente. |
| MI03 | P2 | Invalidar inmediatamente los datos relacionados de Flota y OT al cerrar o reabrir. |
| MI04 | P2 | Derivar el detalle de la OT seleccionada del registro actualizado para evitar montos y encabezados obsoletos. |
| O03 | P3 | Abrir el calendario en el mes de la fecha seleccionada sin impedir navegar a otros meses. |
| D04 | P3 | Adaptar instrucciones de firma, horómetro y reprogramación al tipo de transporte. |
| FR04 | P3 | Presentar un único error de fecha en español y conservar la captura inválida hasta corregirla. |
| MI05 | P3 | Usar el ancho móvil disponible del panel y permitir que los renglones de mano de obra se acomoden sin ocultar nombre ni acciones. |
| F06 | P3 | Mostrar la misma identidad legal de empresa en todos los roles mediante una consulta que devuelve solamente el nombre. |
| F01 | P2 | Ya corregido. Ingresos conciliado: $16,820 + $2,900 + $1,740 = $21,460; la nota de crédito de $580 se descuenta de $3,480. |
| F04 | P2 | Ya corregido. Los botones de permisos anuncian rol, módulo, nivel y acción a tecnologías de asistencia. |
| F05 | P3 | Ya corregido. Tarjetas CxP y folios legibles, revalidados a 1280 × 720 y 375 × 812. |

## Contratos de datos y despliegue

Aplicar las migraciones en orden antes de publicar 8.42.32:

1. `0081_operational_lifecycle_guards`: disponibilidad con mantenimiento, fechas y custodia, integridad de transportes y finalización de entrega con permisos limitados.
2. `0082_maintenance_cost_integrity`: OT cerradas, fecha de cierre y costo real de daños. `actual_cost_source` distingue un costo manual de uno calculado por Mantenimiento; `actual_cost_recorded_at` indica que fue valorado. Un cero legado sin fuente continúa pendiente de valoración.
3. `0083_organization_display_identity`: nombre legal para miembros internos activos. No concede lectura de configuración fiscal ni llaves.
4. `0084_notification_recipient_org_scope`: destinatarios de nuevos avisos por empresa. Versiona también el trigger de pagos que ya existe en Cloud y faltaba en el historial. No borra notificaciones antiguas.

Las migraciones no corrigen automáticamente montos, fechas ni notificaciones existentes. Las OT que heredaron presupuesto como gasto manual necesitan revisar el gasto real antes de cerrar. Se conservan las filas usadas como evidencia de auditoría. Ninguna de estas operaciones emite facturas ni envía correo.

Las pruebas SQL nuevas usan transacciones con rollback y deben ejecutarse exclusivamente en la base efímera de CI, nunca sobre Lovable Cloud. Cubren miembros A/B, portal, cuentas inactivas, permisos, fechas, costos y destinatarios. La publicación exige los checks del commit final, incluida la suite RLS de base de datos.

## Verificación

Se agregaron regresiones de los flujos afectados en Vitest y SQL. La revalidación visual de F01, F04 y F05 corresponde a la versión publicada 8.42.31; los veinte cambios nuevos requieren comprobación después de aplicar las migraciones y publicar 8.42.32. El estado de despliegue y los resultados finales se registran en el informe de entrega y en la PR.
