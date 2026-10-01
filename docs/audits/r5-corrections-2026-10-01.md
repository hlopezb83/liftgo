# Correcciones de auditoría R5 — 2026-10-01

Versión prevista: **8.42.34**. Base de revisión: `a4d8adb2f97d4a9da47d2d67b360b3a6de9b06b3`.

Las correcciones conservan la separación entre UI, hooks de datos y reglas de base de datos. Las pruebas SQL se ejecutan sobre la base efímera de CI; no preparan datos en Lovable Cloud.

## Alcance y criterios de aceptación

| Hallazgo | Corrección | Comprobación requerida |
| --- | --- | --- |
| FIN-R2-01 | Generar Excel desde el snapshot persistido del lote | Cambiar banco primario entre consulta y creación; Excel y snapshot coinciden |
| OP-R2-01 | Separar metadatos de ajuste de stock; ajuste atómico con conteo esperado y motivo | Un formulario viejo conserva el consumo; un ajuste con conteo obsoleto falla sin movimiento |
| OP-R2-02 | Bloquear y recalcular los equipos de origen y destino de una OT | Reasignar actualiza ambos; otros daños, OT y rentas físicas mantienen sus bloqueos |
| OP-R3-01 | Daños abiertos bloquean disponibilidad, confirmación y entrega en el servidor | Reserva sobre daño abierto rechazada incluso con petición directa |
| FIN-R3-01 | Moneda bancaria inmutable tras importar movimientos; lectura de historial falla cerrada | Cambiar moneda rechazado por SQL y UI; importación invalida la consulta |
| COM-R3-01 | Reemplazar moneda y TC al cargar reserva primaria | Pasar de USD a reserva MXN restaura MXN y TC 1 |
| OP-R2-03 | Alinear INSERT/UPDATE de Administrativo con Mantenimiento/full y empresa activa | Operaciones permitidas funcionan; lectura, portal y otra empresa no ganan escritura |
| COM-02 | Captura limitada del firmante en contrato enviado | Sólo signed_by cambia; cambio concurrente o estado distinto impide guardar |
| COM-01 | Persistir la partida de rental_meta al crear reservas | Dos partidas del mismo modelo conservan sus precios/descuentos; identidad inmutable |
| FIN-R3-02 | Historial de lotes, recuperación de descarga y cancelación conservando snapshot | Reintento no crea otro lote; cancelación idempotente; pago vinculado bloquea cancelar |
| FIN-R2-02 | Conservar selección e importes parciales al refrescar | Un importe que excede el saldo actualizado permanece visible y bloquea exportación |
| FIN-R2-03 | Invalidar saldos, exportación, conciliación y caja tras borrar pago | Datos dependientes se vuelven a consultar sin recargar toda la aplicación |
| OP-R2-04 | Invalidar flota, daños, devoluciones, mantenimiento y resúmenes afectados | Las pantallas relacionadas reflejan el resultado de la mutación |
| OP-R3-02 | Reguardar correcciones del reporte antes de reintentar fotos, con versión esperada | Mantener una sola fila; ediciones conservadas; Mecánico sube sólo evidencia de reporte propio autorizado |
| FIN-R2-04 | Error de consulta explícito con reintento | Fallo de red no se presenta como una lista vacía válida |
| COM-03 | Mostrar error de correo junto a Email | Se limpia el error al corregir el correo |
| COM-04 | Importar CSF marca cambios del formulario | Cerrar sin guardar ofrece confirmación de descarte |

## Compatibilidad de datos

- Las reservas antiguas no reciben una identidad cotizada inferida. Cuando las partidas sean ambiguas, se conserva el bloqueo de revisión para evitar distribuir descuentos incorrectamente.
- Los lotes cancelados conservan sus filas y su información bancaria. No se descargan como nuevas instrucciones de pago y no se vinculan automáticamente a pagos posteriores.
- La autoría de daños anteriores sigue vacía; un Mecánico no obtiene acceso de escritura a reportes ajenos o históricos por esta migración.
- El ajuste de stock registra cantidades anterior y nueva, motivo, autor y empresa; editar ubicación o costo no modifica existencias.
- Una unidad físicamente entregada continúa rentada hasta su devolución. Los equipos vendidos, retirados o archivados conservan su estado.

## Validación y despliegue

Estado inicial: cambios locales en revisión; migraciones y publicación pendientes. La aceptación distingue pruebas unitarias, SQL/RLS en CI, aplicación de migraciones y comprobación visual.

1. Revisar diff, TypeScript, ESLint sin warnings, arquitectura, pruebas de regresión, build y journal.
2. Ejecutar CI completo, incluido RLS A/B y permisos en PostgreSQL efímero.
3. Fusionar únicamente con CI aprobado para el SHA revisado.
4. Leer el ledger de Cloud y aplicar en orden `0085`, `0086` y `0087`; comprobar de nuevo ledger, objetos y permisos.
5. Publicar y comprobar versión `8.42.34` en `https://liftgo.lovable.app/`.
6. Verificar los recorridos autorizados de ELOGISTIX. Las operaciones destructivas requieren la confirmación específica correspondiente. Si falta una sesión o fixture, se registra la limitación sin atribuir cobertura visual inexistente.

El rollback operativo es detener la publicación y aplicar una corrección posterior; no se borra historial ni se revierte una migración ya aplicada de forma destructiva.
