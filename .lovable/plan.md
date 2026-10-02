# Auditoría del módulo de facturación recurrente

## Lo que ya confirmé (solo lectura)
- La función de generación recurrente no tiene registros recientes de error ni de ejecución en los logs disponibles.
- No existe tarea programada activa para facturación recurrente (sí la hay para mantenimiento). El código marca la generación automática como "deshabilitada (política manual)", así que es intencional, no un fallo.
- Ningún archivo de pantalla invoca esa función por su nombre; falta confirmar desde dónde la disparan los usuarios.
- El último despliegue (PR #150) excluye cotizaciones con descuento o de origen inaccesible: esto puede parecer un "error" porque esas rentas dejan de facturarse.

Diagnóstico de la causa: **aún no confirmado**. El primer paso es reunir evidencia.

## Fase 1 — Evidencia (solo lectura, sin escribir datos)
1. Errores reales: Sentry, logs de base de datos y de la función filtrando "recurring", "billing", "invoice".
2. Datos: rentas con facturación recurrente activa cuyo siguiente cobro ya venció sin factura; facturas recurrentes en borrador/timbrado fallido; filas en la cola de reintentos CFDI.
3. Rentas excluidas por la protección de descuentos (cuántas y de qué empresa).
4. Flujo en pantalla: localizar el botón o acción que genera facturas recurrentes y la tarjeta de facturación de la renta; revisar mensajes de error mostrados.
5. Aislamiento entre empresas: confirmar filtros por organización en selección y guardado.

## Fase 2 — Reporte
Lista de hallazgos con severidad, impacto para el usuario y causa confirmada (con analogía breve).

## Fase 3 — Correcciones (cada una se te propone antes de aplicarse)
- Corregir solo lo confirmado; pruebas puntuales del módulo; changelog actualizado.
- Si se decide reactivar la generación automática o cambiar la exclusión por descuentos, será decisión explícita tuya.
- Sin pruebas con escritura contra producción; suite completa queda para CI.

## Pregunta útil
Si tienes el mensaje exacto de error, la empresa o el folio de renta afectado, acelera mucho el diagnóstico.
