

## Mostrar empresa solo cuando sea diferente al nombre

### Cambio
En los dropdowns de cliente, mostrar `nombre — empresa` solo cuando el valor de `company` sea diferente al de `name`. Cuando sean iguales, mostrar solo el nombre.

### Archivos a modificar

**1. `src/pages/InvoiceForm.tsx` (~linea 198)**
Cambiar:
```
{c.name}{c.company ? ` — ${c.company}` : ""}
```
Por:
```
{c.name}{c.company && c.company !== c.name ? ` — ${c.company}` : ""}
```

**2. `src/components/CustomerSelector.tsx` (~linea 30)**
Mismo cambio en el `SelectItem` del dropdown de cliente existente.

### Alcance
- Solo se cambia la logica de renderizado del texto en 2 archivos
- No hay cambios en base de datos ni en logica de negocio
