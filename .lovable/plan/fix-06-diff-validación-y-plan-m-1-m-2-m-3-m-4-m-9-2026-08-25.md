# fix-06.diff — validación y plan (M-1, M-2, M-3, M-4, M-9)

Revisé el estado real del proyecto y de la base (PostgreSQL 17.6). Los cinco hallazgos son reales, pero dos parches necesitan ajustes antes de aplicarse.

## Qué verifiqué

- No existe tabla `fiscal_periods` (M-1 aplica).
- `payments` no tiene columna `amount_mxn`; sí tiene `amount`, `currency`, `exchange_rate`, `payment_date`, `invoice_id` (M-2 aplica).
- `invoices` tiene `tipo_cambio`, `cfdi_uuid`, `issued_at`, `status` (M-2 y M-1 aplican).
- `useEntitySearch.ts` no filtra cancelados ni `deleted_at`; hay 1 cliente borrado y facturas canceladas que hoy aparecen en la búsqueda global (M-3 aplica).
- `quoteFormBuilders.ts` aún aplica el descuento fijo "$" solo a la primera partida (M-9 aplica).
- Hay 2 pagos existentes con `payment_date` anterior a la emisión de su factura y 0 pagos con fecha futura. El trigger de M-4 solo corre en alta/edición, así que no rompe datos históricos, pero esos 2 pagos no se podrán editar sin corregir la fecha.

## Cambios propuestos

### M-1 — Cierre de periodos fiscales
Nueva tabla `fiscal_periods` (periodo `YYYY-MM`, cierre y quién cerró) y triggers que rechazan facturas emitidas o pagos registrados con fecha dentro de un periodo ya cerrado.

Ajustes sobre el parche original para cumplir las reglas permanentes de SQL:
- Usar `(select auth.uid())` en las policies.
- Separar la policy de administración por operación en lugar de `FOR ALL`, y agregar los `GRANT INSERT/UPDATE/DELETE` que faltaban (el parche solo daba `SELECT`, así que los admins no podrían cerrar periodos).
- `GRANT ALL` a `service_role`, sin acceso para `anon`.
- Agregar `created_at`/`updated_at` con trigger.

Nota: por ahora el cierre de periodos se hará por base de datos; no incluye pantalla de administración (puedo agregarla después si la quieres).

### M-2 — Tipo de cambio congelado + importe en MXN del pago
- Trigger que impide cambiar `invoices.tipo_cambio` si la factura ya está timbrada o ya tiene pagos.
- Nueva columna `payments.amount_mxn`, calculada al insertar con el tipo de cambio de la factura (o el del pago como respaldo).

Ajuste: el parche solo calcula en `INSERT`; lo extiendo a `UPDATE` de `amount`/`exchange_rate`/`invoice_id` para que no quede desincronizado al editar un pago.

### M-3 — Búsqueda global sin basura
Excluir facturas y reservas canceladas y clientes eliminados en `useEntitySearch.ts`.

### M-4 — Ventana válida de fecha de pago
Trigger que rechaza pagos con fecha a más de 7 días en el futuro (hora de Monterrey) o anterior a la emisión de su factura.

Ajuste: los 2 pagos históricos fuera de ventana se quedan como están (sin backfill, igual que en H-6); solo se validan altas y ediciones.

### M-9 — Descuento fijo en cascada
En cotizaciones, un descuento de "$" sobre una línea de renta que genera varias partidas (mensual + semanal + diaria) ahora se reparte en cascada: cada partida absorbe hasta su propio total y el remanente pasa a la siguiente, en vez de perderse.

## Verificación
- Pruebas SQL de humo para los tres triggers nuevos (periodo cerrado, tipo de cambio inmutable, ventana de fecha de pago).
- Pruebas Vitest para el descuento en cascada y para los filtros de búsqueda.
- `bun run lint`, build y suite completa.
- Nueva entrada de changelog **v7.340.0** (`public/changelog.json` + `public/changelog/v7.340.0.json`).
