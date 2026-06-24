## Cambio

Reemplazar el menú `Acciones` (3 puntos) en el header de detalle de factura por botones inline. Mismas acciones, misma lógica condicional, sin DropdownMenu.

## Archivo
- `src/features/invoices/components/invoke-detail/InvoiceDetailActions.tsx`

## Detalle
- Eliminar `ActionsMenu` y el import de `DropdownMenu*` y `MoreHorizontal`.
- Renderizar como `<Button size="sm" variant="outline">` (cada uno con su ícono actual) en el mismo flex del header, en este orden:
  1. `Editar` — si `canEdit`
  2. `Timbrar CFDI` — si `canStamp` y NO es draft (el draft ya tiene botón primario aparte)
  3. `Descargar XML` — si `isStamped`
  4. `Cancelar CFDI` — si `isStamped && !isPendingCancel`, variante `outline` con texto destructivo
  5. `Eliminar` — dentro de `RoleGuard module="Facturas" minAccess="full"`, variante `outline` destructiva
- Mantener: `CancellationBlock`, botón primario de `Timbrar` en draft, botón primario `Registrar Pago`, `InvoicePDFButton` (Descargar PDF SAT).
- El contenedor padre ya hace flex-wrap; no se requiere cambio adicional.

## Fuera de alcance
Otras pantallas con menús de 3 puntos (listado, otros detalles).
