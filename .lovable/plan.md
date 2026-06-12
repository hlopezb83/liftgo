Plan propuesto

1. Hacer el campo de monto inequívoco para accesibilidad y pruebas
- En `RecordPaymentDialog.tsx`, mantener `Label htmlFor` e `Input id`, y agregar un nombre accesible explícito al input: `aria-label="Monto del pago"`.
- Usar un `id` más específico/estable para evitar colisiones: `recordPaymentAmount`.

2. Ajustar el E2E para apuntar al diálogo correcto
- En `tests/e2e/invoice-payment.spec.ts`, después de abrir “Registrar Pago”, localizar primero el diálogo por rol/nombre `Registrar Pago`.
- Buscar el input dentro de ese diálogo con `dialog.getByLabel(/monto/i)` en vez de usar `page.getByLabel(...).first()`, evitando que Playwright tome otro campo oculto o no relacionado.

3. Mantener trazabilidad del cambio
- Agregar `public/changelog/v6.44.7.json`.
- Insertar la entrada `6.44.7` al inicio de `public/changelog.json`, como patch de testing, describiendo que el E2E ahora usa un selector accesible y acotado al modal de registrar pago.

Validación esperada
- El test `invoice-payment.spec.ts` debe dejar de fallar en la línea del campo “Monto”, porque el locator ya no depende de `.first()` a nivel página y el control tiene un nombre accesible estable.