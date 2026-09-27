# Ingreso contractual y sesión — 8.42.14

Base: `7946811ddffa02f03ee84a43c53ad4b349c46bb5` (PR #151).

## Importes esperados

El periodo completo del contrato puede recuperar el neto de su cotización con descuento. La lógica compartida de renta reconstruye las partidas originales, comprueba modelos, cantidades, tarifas, moneda y organización, y distribuye el descuento en centavos por ID estable de reserva. No incorpora logística al ingreso esperado de renta. Las dos reservas del caso auditado pasan de 5,000.75 brutos por equipo a 4,500.67 y 4,500.68 netos, según su asignación estable de centavos.

Las fuentes incompletas, periodos parciales/extendidos del contrato, tarifas distintas, cancelaciones que dejan incompleto el lote o mapeos ambiguos continúan requiriendo revisión. El resumen no calcula un neto nuevo para esos casos. Las reservas hermanas se consultan por cotización y organización, con comprobación de conteo completo y clave de caché dependiente de la versión de la reserva.

## Importes facturados

La función SQL `sync_invoice_bookings` registra en `line_index` el orden de selección de reservas; ese índice no prueba que una partida de la factura corresponda a ese equipo. El resumen anterior tomaba el bruto de una partida por ese índice o dividía toda la factura entre las reservas, incluyendo partidas ajenas a la renta.

El resumen consulta todos los vínculos de las facturas, también cuando la reserva es la primaria. Suma las partidas de renta después de sus descuentos; en facturas con varias reservas exige identificar el equipo por vínculo explícito de partida, serie o nombre único del formato generado. Comprueba la suma neta del documento contra su subtotal y excluye logística del ingreso de renta. Una atribución incierta devuelve un estado de revisión en lugar de una división igual. La UI oculta el importe facturado y el balance si cualquier factura del conjunto requiere revisión. Las facturas con moneda extranjera sin tipo de cambio válido tampoco se suman como pesos.

Las partidas históricas agrupadas por modelo sin identificación por equipo pueden seguir requiriendo revisión. No se modifican las facturas ni los índices existentes. Los conteos detectan respuestas truncadas de facturas y vínculos.

## Sesión

La auditoría publicada observó un listado vacío que volvió a mostrar diez cotizaciones después de recargar e iniciar sesión. No se estableció la causa exacta de ese incidente. La revisión de código confirmó dos vías que se protegen en este lote:

- `getSession()` al arrancar podía aplicar una respuesta antigua después de un evento de inicio, cierre o renovación de sesión. Ahora el evento más reciente prevalece y una instancia desmontada no aplica respuestas tardías.
- Una consulta sin sesión podía recibir `[]` de RLS y presentarse como ausencia de cotizaciones. El listado comprueba la sesión del SDK antes de consultar; su ausencia produce un error 401 manejado por el flujo de acceso existente.

La pantalla de acceso conserva el contexto y dice «Inicia sesión para continuar en esta página», sin afirmar que una ruta protegida no existe. La implementación respeta el callback síncrono del SDK documentado en https://supabase.com/docs/reference/javascript/auth-onauthstatechange y usa https://supabase.com/docs/reference/javascript/auth-getsession para el estado local. Esto no reemplaza RLS ni las comprobaciones de identidad del servidor.

## Pendiente

COM-02 sigue parcial: repartir el neto entre ciclos/periodos parciales necesita confirmar la regla comercial. Se solicitó confirmar conservar el total cotizado y aplicar un descuento fijo una sola vez durante su vigencia. La facturación automática conserva el bloqueo de descuentos mientras esa decisión esté pendiente. No hay cambios de SQL, Edge Functions ni datos en este lote.

## Validación

Pruebas offline de importes netos, descuentos fijos/porcentuales, centavos, fuentes incompletas, otra organización/moneda, cambios de tarifa y periodo, repartos distintos por equipo, varias partidas por reserva, logística, índices sin correspondencia y sesión concurrente. Se conserva la suite de recuperación de contraseña. La validación final de CI y la publicación se registran en el informe local de verificación.
