## Auditoría completa del Estado de Resultados

### Hallazgos

#### 🔴 1. Doble registro de COGS (lo que reportas)

`(-) Costo de Venta` y `(-) Costo de Equipos Vendidos` son el mismo concepto contable. Hoy aparecen como dos renglones independientes y ambos se restan de la utilidad bruta:

- **Costo de Venta** = facturas de proveedor con `category = 'costo_venta'` (canal manual).
- **Costo de Equipos Vendidos** = valor en libros calculado automático al vender un montacargas (v6.91.0).

Si el usuario llegara a registrar una factura de proveedor `costo_venta` para una venta que ya fue contada automáticamente → **doble descuento de utilidad**.

#### 🟡 2. Potencial doble conteo de mantenimiento y refacciones

`DIRECT_COST_CATEGORIES` incluye las categorías `mantenimiento` y `refacciones` de `supplier_bills`, **además** del `(-) Mantenimiento` que viene de `maintenance_logs.cost`. Si el usuario registra el mismo gasto en ambos lados, se duplica. Hoy no hay aviso ni guardrail.

#### 🟡 3. Variable interna mal nombrada

En `computeDerivedTotals`, la variable se llama `costoVenta` pero en realidad es la suma de **todas las 6 categorías** de `DIRECT_COST_CATEGORIES` (costo_venta + mantenimiento + refacciones + combustible + transporte_logistica + seguros_equipo). Induce a error al leer el código.

#### 🟢 4. Decisiones intencionales (no son bugs, pero las documento)

- **Depreciación solo aplica a equipos con renta activa en el mes**: criterio de management accounting (depreciación ligada a generación de ingreso). Distinto al criterio fiscal puro. **Confirmar si así se mantiene.**
- **Depreciación va fuera de `totalExpenses`** y se resta después para mostrar "Utilidad antes de Depreciación" (estilo EBITDA). Correcto.
- **Clasificación renta vs venta**: factura es renta si tiene `booking_id` o link en `invoice_bookings` o `quote_id` de tipo `rental`. Validado en v6.90.2.

#### 🟢 5. Sin issues encontrados

- Cálculo COGS automático con 48 meses (ISR) — correcto.
- Filtros `is_e2e` aplicados en invoices, bookings, forklifts y quotes.
- `maintenance_logs` y `damage_records` no tienen columna `is_e2e`, por lo que no aplica filtrar ahí.

---

## Plan de corrección

### A. Unificar COGS en una sola línea

1. **Quitar `costo_venta` de `DIRECT_COST_CATEGORIES`** en `types.ts`.
2. **Sumar `expenses.costo_venta` dentro de `cogsForkliftSales`** en `computeDerivedTotals`, renombrando el campo a `cogsTotal` (con campos derivados `cogsAuto` y `cogsManual` para el desglose).
3. **Una sola fila visible**: `(-) Costo de Equipos Vendidos` con el `cogsTotal`. El desglose expandible muestra:
   - "Automático: \<nombre forklift\>" → valor en libros (lo que ya hace).
   - "Manual: Factura \<folio\>" → línea por cada bill con categoría `costo_venta` que caiga en el mes.
4. **Backend (RPC)**: agregar CTE `costo_venta_bills_by_month` que devuelva `{ amount_total, breakdown: jsonb }` con folio del bill. Mergear el breakdown en el `cogs_by_forklift` (renombrarlo a `cogs_breakdown`).

### B. Renombrar variable interna

5. `costoVenta` → `directCostsSubtotal` en `computeDerivedTotals` (cosmético, no cambia el cálculo).

### C. Aviso de posible doble conteo (no bloqueante)

6. **Tooltip o nota al pie** debajo de `(-) Mantenimiento`: "Incluye solo registros de `maintenance_logs`. Si también registras facturas de proveedor con categoría 'Mantenimiento', se contarán por separado."
   - Alternativa más fuerte (no propongo ahora): excluir bills de categoría `mantenimiento` cuando estén ligadas a un `maintenance_log` vía `supplier_id`. Requiere decisión de negocio.

### D. Tests + Changelog

7. Actualizar `computeDerivedTotals.test.ts` y `statementRowFactories.test.ts` para reflejar la unión.
8. **Changelog `v6.92.0`** (minor — cambio de línea contable visible).

---

## Pregunta de validación

Antes de implementar, confirmar:

**¿Mantienes la regla "depreciación solo para equipos con renta activa"?** Si quieres que el ISR (25% anual sobre todo el parque, vendido o no) se aplique a todo equipo en operación, hay que cambiar el filtro del RPC. (Mi propuesta: dejarlo como está — es un P&L de management más útil que el fiscal. Pero tú decides.)