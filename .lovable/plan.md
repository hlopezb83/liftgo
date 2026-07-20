## Auditoría YTD 2026 — doble conteo por categoría del Estado de Resultados

Query ejecutado contra `supplier_bills` (status ≠ cancelled) y `operating_expenses`, ambos con fecha ≥ 2026-01-01. Match de duplicado = misma fecha + mismo monto (2 decimales) + descripción normalizada (trim, colapso de espacios, lowercase). La regla actual del RPC prioriza `supplier_bills`.

### Categorías con doble conteo detectado


| Categoría  | SB partidas | SB total   | OE partidas | OE total   | Duplicadas | Descartado del P&L | Neto P&L   |
| ---------- | ----------- | ---------- | ----------- | ---------- | ---------- | ------------------ | ---------- |
| otro       | 52          | 891,873.87 | 48          | 786,781.96 | 48         | **786,781.96**     | 891,873.87 |
| renta      | 7           | 325,293.12 | 6           | 272,592.00 | 6          | **272,592.00**     | 325,293.12 |
| nomina     | 22          | 164,167.16 | 23          | 170,410.06 | 21         | **153,095.12**     | 181,482.10 |
| publicidad | 17          | 119,748.84 | 14          | 95,983.20  | 14         | **95,983.20**      | 119,748.84 |
| caja_chica | 1           | 10,706.90  | 1           | 10,706.90  | 1          | **10,706.90**      | 10,706.90  |


**Total descartado por deduplicación: $1,319,159.18 MXN.**

### Categorías sin doble conteo (una sola fuente)

- Solo `supplier_bills`: mantenimiento ($28,188), transporte_logistica ($73,592), intereses ($187,739.35), honorarios ($4,000), comisiones_bancarias ($1,461.50), refacciones ($3,201.60), servicios_publicos ($5,000).
- Solo `operating_expenses`: **costo_venta ($363,040 · 1 partida)** — captura únicamente en OE, no expone riesgo de doble conteo pero conviene evaluar si debería registrarse como factura de proveedor.

### Hallazgo pendiente en `nomina`

`operating_expenses.nomina` tiene 23 partidas por $170,410.06 pero el matcher sólo captura 21 ($153,095.12). Quedan **2 partidas por $17,314.94** que no matchean con ninguna `supplier_bills` de la misma categoría. Posibles causas: descripción distinta (typos, mayúsculas con acentos, "Nómina 1a quincena" vs "Nomina primera quincena"), monto redondeado distinto por retenciones, o fechas desfasadas 1 día. Podrían ser gastos legítimos únicos o duplicados no detectados.

## Entregable propuesto

Registrar el reporte como changelog **v7.108.4** (patch, sin cambios de código) con:

- Tabla de impacto por categoría (arriba).
- Total descartado.
- Flag explícito sobre las 2 partidas residuales de `nomina` para revisión manual.
- Nota sobre `costo_venta` capturado sólo en OE.

## Preguntas

1. ¿Quieres que en el mismo turno investigue las 2 partidas residuales de `nomina` (listar id, fecha, monto, descripción para que decidas si son duplicados no detectados o legítimos)? Si
2. ¿Quieres que el reporte se guarde también como archivo Markdown en `/mnt/documents/` para compartir fuera de la app, o solo como changelog?