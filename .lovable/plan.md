

## Agregar cantidad y multiples modelos en cotizaciones de venta

### Resumen

Actualmente, en modo "Venta", solo se puede seleccionar un modelo de equipo con cantidad fija de 1. Se cambiara para permitir agregar multiples lineas de venta, cada una con su modelo, cantidad y precio unitario.

### Enfoque

Reemplazar el selector unico de modelo + precio por una lista dinamica de "lineas de venta" donde cada linea tiene: modelo, cantidad y precio unitario. El usuario puede agregar y eliminar lineas.

### Cambios en codigo

**1. `src/pages/QuoteForm.tsx`**

- Reemplazar los estados `equipmentModelId` y `salePrice` por un array de lineas de venta:
  ```text
  saleLines: Array<{ modelId: string; quantity: number; unitPrice: number }>
  ```
- Inicializar con una linea vacia `[{ modelId: "", quantity: 1, unitPrice: 0 }]`
- Botones "Agregar linea" y "Eliminar" por cada linea
- Los `lineItems` se generan mapeando cada linea de venta a un LineItem con la descripcion del modelo
- Al editar una cotizacion existente de venta, reconstruir las `saleLines` desde `line_items`
- Validacion: al menos una linea con modelo seleccionado, cantidad > 0 y precio > 0
- El campo `equipment_model_id` en el payload se establece al primer modelo (compatibilidad) o null

**2. Nuevo componente: `src/components/SaleLineItems.tsx`**

Componente que renderiza la lista de lineas de venta:
- Cada fila: selector de modelo (dropdown), input de cantidad (numerico, min 1), input de precio unitario, total calculado, boton eliminar
- Boton "Agregar modelo" al final
- Recibe la lista de modelos disponibles de `equipment_models`
- Props: `lines`, `onChange`, `models`

**3. `src/pages/QuoteDetail.tsx`**

- Sin cambios necesarios: ya muestra `line_items` con `ReadOnlyLineItemsTable` que soporta multiples lineas con cantidad

**4. `src/components/QuotePDFButton.tsx`**

- Sin cambios necesarios: ya genera PDF desde `line_items` que ahora tendran multiples entradas con cantidades correctas

### No requiere cambios en base de datos

Los datos de multiples modelos se almacenan en el campo `line_items` (jsonb) que ya soporta un array de objetos. El campo `equipment_model_id` se mantiene por compatibilidad pero apuntara al primer modelo seleccionado.

### Flujo de usuario

1. Nueva Cotizacion > Venta
2. Aparece una primera linea con: selector de modelo, cantidad (default 1), precio unitario
3. El usuario puede agregar mas lineas con "Agregar modelo"
4. Cada linea muestra el total (cantidad x precio)
5. El resumen de costos se actualiza automaticamente
6. Al guardar, cada linea se convierte en un item de `line_items`

### Detalle tecnico

- 1 componente nuevo (`SaleLineItems`)
- 1 archivo modificado (`QuoteForm.tsx`)
- Sin migraciones de base de datos
- Sin cambios en edge functions

