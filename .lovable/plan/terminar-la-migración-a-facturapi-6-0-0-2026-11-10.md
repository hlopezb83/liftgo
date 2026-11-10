# Terminar la migración a Facturapi 6.0.0

La versión más reciente publicada en npm al 10 de noviembre de 2026 es **6.0.0**. El paquete revisado está preparado; todavía no se ha aplicado a producción. La autorización de migración y la confirmación del usuario sobre GitHub Actions y el receptor ficticio se conservan.

## 1. Cerrar el pendiente de seguridad
- Preparar y probar de forma aislada una restauración de las tareas automáticas que no dependa de una siguiente respuesta en el chat.
- Capturar sus identificadores y estado previo; restaurar únicamente las que esta ventana haya pausado. Rechazar estados inesperados y corridas en curso.
- Programar la restauración antes de pausar, en la misma transacción. Comprobar que quedó registrada antes de cambiar la versión.
- Revisar de forma independiente el procedimiento y actualizar guía, pruebas y manifiesto. No aplicar SQL durante la preparación.
- Si el servicio no garantiza la restauración dentro del límite de 60 minutos, detener antes de la pausa y presentar esa limitación; una tarea programada no equivale a una garantía de ejecución puntual.

## 2. Aplicar el paquete revisado
- Abrir una ventana fresca; no extender ni reutilizar la de las 18:30 UTC.
- Revalidar el paquete y las condiciones de inicio. Conservar el preflight temporal apagado.
- Aplicar exclusivamente el kit con sus huellas verificadas y desplegar las 12 funciones existentes. Sin nuevas funciones, permisos ni cambios fiscales ajenos al SDK.
- Verificar el resultado de cada despliegue. Ante un resultado parcial o incierto, detener las pruebas y restaurar la versión anterior mediante el kit; no afirmar que los despliegues son atómicos.

## 3. Verificar y cerrar
- El usuario prueba en ELOGISTIX, modo test: dos facturas de $116 MXN, REP de $58 y NC de $58, máximo cuatro CFDI y cantidad 1; descarga PDF/XML, cancela únicamente la factura B con motivo 02 y refresca su estado.
- Sin repetir emisiones ante resultados inciertos; sin documentos live emitidos por el agente.
- Verificar evidencia saneada, restauración de tareas y estado final. Registrar versión, despliegues, resultado y reversa si ocurrió.
- Mantener pendiente la limpieza de Fase 5 hasta cumplir las dos semanas de estabilidad del plan.

## Detalles técnicos
- Activación: `qa/facturapi6-phase4/activation.py`, estados base/aplicado exactos y `deno.json`/`deno.lock` juntos.
- Restauración: mecanismo SQL temporal soportado, sin endpoint nuevo, sin credenciales en instrucciones y sin alterar permisos globales. Su revisión debe contemplar errores del programador, persistencia y limpieza.
- Pruebas locales: únicamente focales de ventana/restauración/kit; suite completa en GitHub Actions. No pruebas con escrituras contra la base productiva.
- Fuente de versión: `https://registry.npmjs.org/facturapi/latest`, consultada en este turno, devuelve `6.0.0`.