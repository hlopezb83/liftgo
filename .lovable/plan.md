

## Reemplazar campo de texto "Nombre del Cliente" por dropdown en InvoiceForm

### Cambio
En `src/pages/InvoiceForm.tsx`, reemplazar el `<Input>` de "Nombre del Cliente" (linea 184-187) por un `<Select>` dropdown que liste los clientes dados de alta. Al seleccionar un cliente del dropdown, se auto-rellenaran tambien los campos CFDI del receptor (RFC, razon social, regimen fiscal, CP, uso CFDI).

### Detalles tecnicos

**Archivo: `src/pages/InvoiceForm.tsx`**

1. Reemplazar el bloque del Input de "Nombre del Cliente" (lineas 183-189) por un dropdown `<Select>` con los clientes de `useCustomers()` (ya importado en linea 28)
2. Al seleccionar un cliente:
   - Se establece `customerId` con el ID del cliente
   - Se establece `customerName` con el nombre del cliente
   - Se auto-rellenan los campos CFDI: `receptorRfc`, `receptorRazonSocial`, `receptorRegimenFiscal`, `receptorDomicilioFiscalCp`, `usoCfdi` (misma logica que ya existe en `handleBookingSelect`, lineas 83-91)
3. El dropdown muestra `nombre — empresa` para cada cliente (patron existente en `CustomerSelector`)
4. Se incluye un placeholder "Seleccionar cliente" y el campo de fecha de vencimiento se mantiene al lado

### Logica de seleccion de cliente (funcion nueva `handleCustomerSelect`)

```text
handleCustomerSelect(customerId):
  - setCustomerId(customerId)
  - Buscar cliente en la lista de customers
  - setCustomerName(customer.name)
  - setReceptorRfc(customer.rfc)
  - setReceptorRazonSocial(customer.name)
  - setReceptorRegimenFiscal(customer.regimen_fiscal)
  - setReceptorDomicilioFiscalCp(customer.domicilio_fiscal_cp)
  - Si customer.uso_cfdi existe, setUsoCfdi(customer.uso_cfdi)
```

### Notas
- No se necesitan cambios en la base de datos
- La logica de auto-relleno CFDI ya existe en `handleBookingSelect`; se extrae a la nueva funcion `handleCustomerSelect` y se reutiliza desde ambos lugares
- Solo se modifica un archivo: `src/pages/InvoiceForm.tsx`

