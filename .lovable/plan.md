# fix-35: limpieza E2E incompleta (R6-18)

## Validación

Confirmé contra la base de datos que el bug es real:

- `credit_notes.invoice_id` tiene la regla **ON DELETE RESTRICT** hacia `invoices`, y `credit_notes.customer_id` no permite borrar clientes con notas de crédito.
- Las funciones actuales `e2e_seed_portal_scenario` y `e2e_teardown` **no mencionan notas de crédito ni el bucket de comprobantes de pago**.

Consecuencia: si una prueba automatizada genera una nota de crédito sobre una factura de prueba, tanto el sembrado como la limpieza fallan con error de llave foránea y los datos de prueba quedan atorados en la base. Además, los comprobantes de pago subidos por clientes de prueba quedan huérfanos en el almacenamiento.

Analogía: es como querer tirar una caja (la factura) que sigue amarrada con un cable (la nota de crédito) a la pared; hay que desconectar el cable primero, y también sacar la basura que se quedó en el clóset (los archivos).

## Qué se implementa

Una sola migración que reemplaza ambas funciones:

1. **`e2e_seed_portal_scenario`**: antes de borrar facturas/clientes previos del escenario, elimina las notas de crédito ligadas a esas facturas o a ese cliente, y borra los archivos del bucket `payment-proofs` bajo el prefijo del cliente de prueba.
2. **`e2e_teardown`**: mismo orden — notas de crédito y archivos de comprobantes antes de facturas y clientes; se reportan los conteos `credit_notes` y `storage_objects` en el resultado.

Se conservan intactos: guard de rol admin, `SET search_path = public`, validación de `allow_e2e_seed`, la regla de no reasignar roles ajenos y los permisos (`REVOKE` a `anon`, `EXECUTE` solo a `authenticated`).

## Notas técnicas

- El borrado de archivos se hace sobre las filas de `storage.objects` filtrando por `bucket_id = 'payment-proofs'` y prefijo `<customer_id>/`; no se altera ninguna estructura ni política del esquema de almacenamiento.
- Solo se tocan registros marcados `is_e2e` / con el `e2e_scope` recibido; los datos reales no se ven afectados.

## Cierre

- Correr los tests unitarios y las suites SQL de humo para confirmar que el sembrado y la limpieza pasan.
- Actualizar el changelog (`public/changelog.json` y el MD) con una entrada **patch** v7.368.1.
