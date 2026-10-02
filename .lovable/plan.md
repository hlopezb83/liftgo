# Facturación recurrente: mostrar el error real y encontrar la causa

## Qué pasa hoy (confirmado)
- La función de generación guarda cada fallo como texto con un convertidor que, si el error trae su mensaje como objeto (o no trae mensaje), lo convierte en "[object Object]". Por eso el modal y el aviso no dicen nada útil.
- En los registros de la base de datos de los últimos 30 minutos no hay errores, así que la falla ocurre antes de guardar la factura (lectura de la cotización o validación previa), no al grabarla.
- El aviso emergente sólo muestra los primeros 140 caracteres y no tiene botón para ver más.

Analogía: es como una alarma que suena pero en la pantalla sólo dice "caja cerrada": sabemos que algo falló, pero no qué.

Causa exacta del fallo de esa reserva: **aún no confirmada**; primero hay que hacer visible el mensaje.

## Cambios
1. **Mensaje legible en la función** (`generate-recurring-invoices`): convertir cualquier error a texto en español con mensaje, detalle, pista y código; si el mensaje viene como objeto, extraerlo o serializarlo. Registrar cada fallo en los logs (sin datos sensibles) con el id de la reserva.
2. **Aviso con "Ver detalles"**: el aviso de "N reserva(s) no se facturaron" tendrá un botón que abre el modal de resultados.
3. **Modal más útil**: cada fallo muestra el folio/cliente de la reserva y el mensaje completo, con opción de copiar el detalle.
4. **Defensa en pantalla**: si llega un error que no es texto, el modal lo formatea en vez de mostrar "[object Object]".
5. Desplegar sólo esa función. Luego te pido repetir "Generar Recurrentes" en preview; con el mensaje real diagnostico y, si hace falta, propongo la corrección de fondo por separado.
6. Pruebas puntuales del convertidor de errores y del modal; changelog (patch).

## Detalles técnicos
- `errorMessage()` en `index.ts`: soportar `message` no-string, `details`, `hint`, `code`; fallback `JSON.stringify` acotado.
- `useGenerateRecurringInvoices.ts`: `notifyWarning` con `action` que abre `RecurringInvoicesResultDialog` (estado elevado en `InvoicesPage`).
- `RecurringInvoicesResultDialog.tsx`: helper `formatFailure(error: unknown)`.
- Sin cambios de SQL ni datos; nada se escribe en producción durante pruebas.
