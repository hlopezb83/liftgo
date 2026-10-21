# MEJ-007: explicar equipos no disponibles

## Alcance

La nueva ayuda de Nueva reserva explica únicamente lo que confirman las lecturas autorizadas. No modifica estados, reservas, devoluciones, modelos ni permisos. No necesita migración.

- La RPC `get_available_forklifts` sigue siendo la autoridad sobre qué equipo puede seleccionarse para las fechas.
- Se muestra el estado operativo por separado de la disponibilidad del calendario.
- Prioridad de causas comprobadas: baja/venta, mantenimiento o daño bloqueante, reserva vencida sin devolución registrada, reserva que se solapa. `Rentado` sin evidencia más precisa se identifica como estado, no como prueba de custodia ni bloqueo exacto.
- Una unidad que la RPC permite reservar, pero cuyo estado sigue en Rentado, se presenta por separado. La reserva futura no acredita devolución ni autoriza entrega.
- Sin evidencia suficiente se muestra “Motivo no confirmado”. Un modelo de catálogo no implica una unidad física ni se inventa como causa de bloqueo.
- Los pasos sugeridos son revisión por el área competente, elección de otra unidad/fecha o devolución real por el flujo autorizado. Nunca liberación manual de Rentado a Disponible.
- El alta conserva sus controles existentes: Administrador. La ayuda es de sólo lectura, también para Administrativo.

## Acceso y datos

La consulta es perezosa: se ejecuta al abrir la ayuda. Exige usuario, empresa interna verificada y Flota/read. Las claves de caché incluyen usuario, empresa, fechas y acceso a reservas. Cambiar empresa o perder permisos oculta inmediatamente los datos anteriores.

Se reutilizan RPC existentes (`get_available_forklifts`, `today_mty`, `forklift_has_maintenance_block`, `booking_is_returned`) y consultas paginadas de flota/reservas. Las tablas se filtran explícitamente por empresa, además de RLS; una segunda comprobación descarta filas ajenas antes de usarlas. Los predicados reciben exclusivamente IDs leídos en esa empresa. No se consultan clientes, costos, tarifas, notas ni detalles de mantenimiento. Sin Reservas/read no se consultan reservas. Fallos parciales se identifican sin inventar causas; un fallo de flota/disponibilidad no se convierte en lista vacía.

La consulta vive bajo la clave de listas de flota para recibir las invalidaciones existentes de reservas, mantenimiento, devoluciones y flota. Actualizar motivos invalida también el selector canónico, evitando mantener un selector desactualizado. Carga, error y refetch no muestran causas viejas ni falsos “sin equipos”. Los predicados por unidad tienen concurrencia máxima de cuatro.

## Integración

`ForkliftAvailabilityHelp` se exporta desde `@/features/fleet` y se coloca después de `ForkliftSelector`, con `dateRange`. El selector admite `isLoading`, `isError`, `isFetching` y `onRetry`. `useAvailableForklifts` expone `isFetching` sin modificar su contrato anterior.

La conexión con BookingForm/State/Logic se coordina con MEJ-004 y se integra después de ambos cambios. El panel no altera el envío ni reemplaza las validaciones finales de disponibilidad.

## Verificación

Pruebas focalizadas cubren prioridad de causas, límites inclusivos de fechas, estado Rentado frente a disponibilidad futura, devolución pendiente verificada, ausencia de evidencia, fallos parciales y críticos, paginación, lecturas mínimas, aislamiento de empresa/usuario/permisos, invalidación compartida, carga/error/refetch y ausencia de acciones de escritura en la UI. Se ejecutan con un solo worker. La integración debe ejecutar además el typecheck y build seriales y el smoke de Nueva reserva.

Resultado local: 88/88 pruebas en 8 archivos (50 casos nuevos y 38 regresiones de roles/calendario), ESLint focal sin hallazgos, `git diff --check` y `arch:check` correctos. No se ejecutaron typecheck/build globales concurrentes ni se modificó la base de datos.
