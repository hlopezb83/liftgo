
## Plan: Integración Inventario ↔ Mantenimiento — "Refacciones Utilizadas" (v3.17.9)

### Resumen
Agregar sección "Refacciones Utilizadas" en el Kanban de mantenimiento donde los mecánicos puedan buscar y seleccionar partes del inventario, especificar cantidades, y que el sistema automáticamente:
1. Inserte registro en `maintenance_parts`
2. Descuente stock de `parts_inventory` (ya existe trigger)
3. Actualice el costo del `maintenance_log` sumando `quantity_used × unit_cost`

### Cambios

**1. `src/hooks/usePartsInventory.ts`** — Mejorar mutación `useAddMaintenancePart`
- Modificar para que además de insertar en `maintenance_parts`, actualice `maintenance_logs.cost` incrementando `quantity_used × cost_at_time`
- El trigger existente `handle_part_usage` ya decrementa el stock automáticamente

**2. Nuevo componente `src/components/maintenance/MaintenancePartsSection.tsx`**
- Componente reutilizable para agregar/ver partes usadas en un log
- Usa Combobox (Popover + Command) para buscar partes por nombre o SKU
- Input numérico para cantidad
- Lista de partes agregadas con nombre, cantidad y costo
- Props: `maintenanceLogId`, `currentCost`

**3. `src/components/maintenance/MaintenanceKanban.tsx`** — Agregar diálogo de detalle
- Cuando el usuario hace clic en una tarjeta, abre un Sheet/Dialog de detalle
- Incluye sección "Refacciones Utilizadas" usando el nuevo componente
- Muestra el costo total actualizado en tiempo real

**4. `src/lib/changelog.ts`** — v3.17.9

### Diagrama de flujo
```text
Mecánico selecciona parte → especifica cantidad →
  └─► INSERT maintenance_parts (part_id, quantity_used, cost_at_time)
        ├─► TRIGGER: parts_inventory.stock_quantity -= quantity_used
        └─► UPDATE maintenance_logs.cost += (quantity_used × cost_at_time)
```

### Detalles técnicos
- El Combobox filtrará partes con stock > 0 y mostrará badge de alerta si stock es bajo
- La mutación hará ambas operaciones (insert + update cost) en una transacción conceptual
- Invalidará queries de `maintenance_parts`, `parts_inventory` y `maintenance_logs`
