
# Eliminar el campo "ID Fiscal" del formulario de clientes

## Problema
El formulario de agregar/editar cliente tiene un campo "ID Fiscal" (`tax_id`) que es redundante, ya que en Mexico se utiliza el RFC, el cual ya tiene su propio campo en la seccion de Datos Fiscales (CFDI).

## Cambios

### Archivo: `src/pages/CustomersPage.tsx`

1. **Eliminar `tax_id` del estado inicial** (linea 25): quitar `tax_id: ""` del objeto `emptyCustomer`.

2. **Eliminar `tax_id` al abrir edicion** (linea 75): quitar `tax_id: c.tax_id || ""` del `setForm`.

3. **Eliminar `tax_id` del payload de envio** (linea 90): quitar `tax_id: form.tax_id || null` del objeto `payload`.

4. **Eliminar el campo del formulario** (lineas 158-164): reemplazar el grid de 2 columnas (Nombre + ID Fiscal) por solo el campo "Nombre / Empresa" a ancho completo, y actualizar el placeholder a algo mas relevante para Mexico (ej. "Montacargas del Norte S.A.").

## Resultado
El formulario mostrara solo el campo RFC en la seccion de Datos Fiscales, eliminando la redundancia del campo ID Fiscal.
