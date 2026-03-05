

## Problema

Al editar una factura, los datos CFDI del receptor (RFC, Razón Social, Régimen Fiscal, C.P.) están vacíos en la base de datos para esta factura. El formulario carga los datos tal cual están almacenados (null), sin consultar la ficha del cliente para rellenarlos.

Los campos `receptor_rfc`, `receptor_razon_social`, `receptor_regimen_fiscal` y `receptor_domicilio_fiscal_cp` son todos `null` en esta factura, aunque sí tiene un `customer_id` asociado con datos fiscales.

## Solución

**Archivo: `src/pages/InvoiceForm.tsx`**

En el `useEffect` que carga datos de la factura existente (línea ~73), después de cargar los campos CFDI del invoice, verificar si los campos del receptor están vacíos y si hay un `customer_id`. Si es así, aplicar los datos fiscales del cliente usando `applyCustomerCfdi`.

```typescript
useEffect(() => {
  if (existing) {
    // ... set all existing fields as before ...
    
    // Si los campos del receptor están vacíos pero hay customer_id,
    // rellenar desde la ficha del cliente
    if (existing.customer_id && !existing.receptor_rfc && customers) {
      const cust = customers.find((c) => c.id === existing.customer_id);
      if (cust) applyCustomerCfdi(cust);
    }
  }
}, [existing, customers]);
```

Se agrega `customers` como dependencia del efecto para que cuando ambos datos (factura y clientes) estén disponibles, se apliquen los datos fiscales faltantes.

