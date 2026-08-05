# Cuadrar el desglose por cliente con el renglón de ingresos (Estado de Resultados)

## Qué encontré

En julio 2026, el renglón "Ingresos por Rentas (con reserva)" y su desglose por cliente no cuadran por **$32,220**:

- Facturas de renta con reserva de julio (8 clientes): **$409,800** — es la suma que muestra el desglose.
- El renglón del reporte resta la nota de crédito de julio (FAC-0089, LOGISTORAGE, $32,220) y muestra **$377,580**.

La causa: en el RPC `get_income_statement`, los totales por mes restan las notas de crédito por categoría, pero las agregaciones por cliente (`rental_booked_by_customer`, `rental_unbooked_by_customer`, `sales_by_customer`, `other_services_by_customer`, `damage_recovery_by_customer`) se calculan **solo con facturas**, sin descontar notas de crédito.

Analogía: el total del ticket ya aplica la devolución, pero el desglose por producto la ignora; por eso las partes no suman lo mismo que el total.

## Cambio propuesto

Migración de base de datos que reescribe `public.get_income_statement` para que el desglose por cliente sea neto de notas de crédito:

1. Agregar un CTE `cn_by_customer` que agrupe las notas de crédito por `month_key`, `revenue_kind` y el `customer_name` de la factura original (mismas reglas de clasificación que ya existen).
2. Unir facturas y notas de crédito (estas últimas con signo negativo) antes de hacer `jsonb_object_agg` en las cinco agregaciones por cliente.
3. Omitir del desglose las entradas que queden en 0 exacto (una nota de crédito total que cancele la factura del mes), para no mostrar renglones vacíos.
4. Sin cambios en la lógica de totales mensuales: sólo se alinea el desglose con lo que ya se muestra.

## Verificación

- Consulta SQL comparando, para cada mes de 2026, `revenue_rental_booked` contra la suma del desglose por cliente: deben coincidir dentro de $0.01 en las cinco categorías.
- Revisión visual en `/income-statement` (julio): LOGISTORAGE debe pasar de $55,500 a $23,280 y el desglose debe sumar $377,580.

## Detalle técnico

- Archivos: sólo migración de base de datos (`get_income_statement`). El frontend no cambia: `useMonthlyData`, `statementRowFactories` y `IncomeStatementTable` ya consumen los mismos campos.
- CSV y PDF heredan el desglose corregido automáticamente.
- Changelog: nueva entrada `v7.280.1` (patch) en `public/changelog.json` + `public/changelog/v7.280.1.json`, y alineación de `package.json` / `public/version.json`.
