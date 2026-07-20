
## Contexto

En el Estado de Resultados, la fila **"Otros Gastos → Otro"** agrega todo lo cargado con categoría `otro` en dos tablas: `supplier_bills` y `operating_expenses` (unidas vía `UNION ALL` en `get_income_statement`).

## Hallazgo importante (no confirmado como bug intencional)

Al consultar los datos reales, la mayoría de los movimientos con `category = 'otro'` aparecen **duplicados** en ambas tablas con la misma fecha, mismo monto y misma descripción. Ejemplos:

- `2026-05-27` — FLETE F-447 ENVIO A EMPAQUES Y EMBALAJES — $2,200 (aparece en `supplier_bills` y en `operating_expenses`)
- `2026-05-26` — INTERESES PRESTAMO MZO26 LC — $81,430 (duplicado)
- `2026-05-21` — F-A11522 ABR26 CONTABILIDAD — $3,448.28 (duplicado)
- `2026-05-13` — F-694 MONITOREO DE EQUIPOS — $9,750 (duplicado)
- `2026-04-23` — K-693 Mantenimientos — $69,818 (duplicado)
- …y muchos más

Como el RPC suma ambas fuentes sin deduplicar, **es probable que "Otro" (y otras categorías) esté inflado al doble en el P&L**. Esto sería consistente con lo que se ve en pantalla.

## Plan (dos entregables)

### 1. Reporte de desglose "Otro"
Entregar en el chat una tabla con todas las partidas categorizadas como `otro` en el rango visible del P&L (por defecto: año en curso, o el rango que indiques), agrupada por mes, mostrando:
- Fecha, proveedor (si aplica), descripción, monto
- Fuente: `supplier_bills` vs `operating_expenses`
- Marca de posible duplicado (mismo monto + misma fecha + descripción similar)

### 2. Confirmación de la causa raíz de la duplicación
Antes de proponer un fix, verificar contigo:
- ¿Los movimientos en `operating_expenses` se están capturando manualmente además de las facturas de proveedor?
- ¿Debería `operating_expenses` excluir las partidas que ya vienen de `supplier_bills`, o al revés?

Con tu confirmación, en un sprint aparte podríamos ajustar `get_income_statement` (o un trigger de captura) para eliminar el doble conteo, con su respectivo test.

### Alcance explícito

- **Sí**: consulta de datos y reporte en chat, plus preguntas de negocio para diagnosticar la duplicación.
- **No** (todavía): cambios de código, migraciones ni fixes al RPC. Eso lo planeamos aparte una vez confirmes el comportamiento esperado.

## Pregunta rápida

¿Qué rango de fechas quieres en el desglose? (por defecto uso el año en curso, `2026-01-01` a hoy).
