
## Objetivo

Ampliar el catálogo de categorías de gasto del módulo de **Cuentas por Pagar** (y reportes de P&L) con las principales para un negocio de renta de montacargas, agrupadas en 4 bloques contables.

## Categorías a agregar al enum `expense_category`

Actuales: `renta`, `nomina`, `software`, `depreciacion`, `costo_venta`, `caja_chica`, `publicidad`, `otro`.

**Operativas (Costo de Servicio):**
- `mantenimiento` — Mantenimiento de Equipo
- `refacciones` — Refacciones y Consumibles
- `combustible` — Combustible
- `transporte_logistica` — Transporte y Logística
- `seguros_equipo` — Seguros de Equipo

**Administrativas:**
- `servicios_publicos` — Servicios Públicos (luz, agua, internet)
- `honorarios` — Honorarios (contables/legales)
- `papeleria` — Papelería y Oficina
- `capacitacion` — Capacitación
- (ya existentes: `renta`, `nomina`, `software`)

**Comerciales:**
- `comisiones_ventas` — Comisiones de Ventas
- `viajes_representacion` — Viajes y Representación
- (ya existente: `publicidad`)

**Financieras:**
- `intereses` — Intereses Financieros
- `comisiones_bancarias` — Comisiones Bancarias

## Cambios técnicos

1. **Migración SQL** — `ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS '<x>'` para cada nuevo valor (en sentencias separadas, sin tocar valores existentes).
2. **`supplierBillConstants.ts`** — Extender `EXPENSE_CATEGORY_LABELS` con los nuevos valores y reordenarlos por grupo para que el `<Select>` los muestre lógicamente. Agregar `EXPENSE_CATEGORY_GROUPS` para agrupar visualmente (label + lista de keys) y usarlo en `SupplierBillFormDialog` y `SupplierBillsFilters` con `SelectGroup`/`SelectLabel`.
3. **Reportes P&L** (`features/reports/hooks/incomeStatement/types.ts`):
   - `DIRECT_COST_CATEGORIES`: agregar `mantenimiento`, `refacciones`, `combustible`, `transporte_logistica`, `seguros_equipo` (junto a `costo_venta`).
   - `EXPENSE_CATEGORIES` (operating below GM): agregar `servicios_publicos`, `honorarios`, `papeleria`, `capacitacion`, `comisiones_ventas`, `viajes_representacion`, `intereses`, `comisiones_bancarias` (junto a `renta`, `nomina`, `caja_chica`, `publicidad`, `otro`).
   - Excluir `software` y `depreciacion` del P&L (regla de memoria vigente).
4. **Changelog v6.90.0** (minor — nuevo catálogo) en `public/changelog.json` + `public/changelog/v6.90.0.json`.

## Notas

- No se elimina ni renombra ninguna categoría existente (compatibilidad con datos previos).
- No se modifican RLS ni GRANTs (solo se extiende un enum).
- El `Select` de filtro y formulario mostrará separadores por grupo (Operativas / Administrativas / Comerciales / Financieras / Otros).
