## Cambio visual: Dropdown de claveProdServ

### Objetivo
En el modal de nueva factura, el dropdown de **Clave de Producto/Servicio** (columna de partidas) debe mostrar **"código - descripción"** en lugar de solo el código numérico.

### Alcance
- Únicamente el componente `EditableLineItemsTable.tsx` en la fila de partidas del formulario de factura.
- El array `CLAVE_PROD_SERV` en `satCatalogs.ts` ya contiene las etiquetas en el formato correcto (ej. `"78181500 - Alquiler de equipo de manejo de materiales"`), por lo que solo hay que cambiar qué propiedad se renderiza dentro del `SelectItem`.

### Cambio técnico
En `src/features/invoices/components/invoice-form/EditableLineItemsTable.tsx`, línea 92:

```tsx
// Antes:
{CLAVE_PROD_SERV.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}

// Después:
{CLAVE_PROD_SERV.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
```

### Notas
- El `value` del `SelectItem` permanece como `c.code` para no alterar el dato guardado.
- No hay impacto en esquemas, backend ni otros flujos.
