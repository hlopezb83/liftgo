# Fase 3: adaptar y probar las funciones reales sin conexión

## Resultado

Preparar una copia aislada de las funciones fiscales reales con Facturapi 6.0.0, para revisar su comportamiento antes de abrir una nueva prueba. **No pasar todavía a producción ni emitir los cuatro documentos.**

## Alcance

1. Conservar intactos el snapshot revisado y las funciones operativas. Crear la adaptación sólo en una carpeta QA fuera de las rutas de despliegue y sin pantalla ni endpoint activo.
2. Incluir factura, REP, nota de crédito, cancelación, PDF/XML y refresco de cancelación; conservar su lógica y persistencia auténticas, no reemplazarlas por un flujo SDK alternativo.
3. Preparar cambios explícitos en la copia QA:
   - Resolver imports y retirar la lectura de entorno al cargar módulos.
   - Leer únicamente configuración de prueba del tenant ELOGISTIX; no leer llave live, enumerar otras llaves ni comparar secretos en una URL.
   - Conectar la exclusividad al contrato booleano ya aprobado mediante dobles locales, sin invocar la función real.
   - Aislar transporte por solicitud y revisar tiempos de espera, cancelación y saneamiento de errores, sin sustituir globalmente fetch o console.
4. Comparar originales y adaptaciones con los mismos datos ficticios: respuestas, consultas, filtros, parámetros de operaciones internas, escrituras, archivos, fechas, idempotencia y fallas parciales. Documentar cualquier diferencia intencional de seguridad; no presentarla como paridad total.
5. Proponer el diario secuencial y cierre con dobles locales. No implementarlo contra Storage real: queda pendiente revisar atomicidad, reservas de etapa y permisos antes de conectar un ejecutor.
6. Entregar diff, manifiesto, resultados focales y SHA para revisión independiente. Actualizar historial y pendientes.

## Comprobaciones

- Importación offline sin efectos, configuración sólo test, tenant exacto y cero red ante bloqueos.
- Ventana vencida durante imports/lectores, apagado, duplicados, resultados inciertos, persistencia fallida y archivos tardíos.
- Mantener máximos autorizados: dos facturas, un REP y una NC, cuatro CFDI, 116 MXN por documento y cantidad uno donde aplica.
- Ejecutar sólo pruebas focales sin red y sin escrituras en la base compartida; suite completa pendiente de GitHub Actions.

## Detalles técnicos y límites

- Base: snapshot PR438 `967ac99`; refresco actual con digest registrado en el inventario. Usar SDK 6.0.0 exacto sin cambiar dependencias operativas.
- La futura frontera soportada es `createServerFn` con sesión existente; este paso sólo prepara helpers/adaptadores offline, no crea ni invoca un endpoint.
- Si el SDK no permite aislar transporte sin cambiar lógica, detener ese punto y documentar la decisión necesaria; no introducir una ruta fiscal alternativa.
- La comparación offline no prueba SQL/triggers reales, atomicidad del servicio, SAT ni runtime Deno integral. Límites hard de duración Preview siguen desconocidos.

## Exclusiones

Sin publicación, despliegue, nuevas Edge Functions, SQL/migraciones, permisos, lectura de secretos, proveedor, emisión, datos ERP, pausa de crons ni apertura de ventana. El preflight sigue `enabled=false`, `shutdown=true`.

La autorización de los cuatro documentos ya existe, pero su ejecución espera revisión independiente de adaptaciones, exclusión durable, pausa/cierre y ventana fresca. Producción todo de una vez y reversa por redeploy pertenecen a la Fase 4 posterior.