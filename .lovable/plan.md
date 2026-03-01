

## Agregar campo "Fecha de Factura" al formulario de nueva factura

### Cambio en base de datos
Agregar columna `issue_date` (tipo `date`, nullable, default `CURRENT_DATE`) a la tabla `invoices`. Esta columna almacena la fecha de emision de la factura, separada de `created_at` (timestamp automatico) y `due_date` (fecha de vencimiento).

### Cambio en el formulario (`src/pages/InvoiceForm.tsx`)

1. Agregar estado `issueDate` inicializado con la fecha de hoy (`new Date()`)
2. En el bloque `useEffect` de edicion, cargar `existing.issue_date` si existe
3. En el grid de fechas, cambiar de 2 columnas a 2 columnas con ambos campos:
   - **Fecha de Factura** (nuevo) - con `DatePickerField`
   - **Fecha de Vencimiento** (existente) - ya esta implementado
4. Incluir `issue_date` en el payload de creacion/actualizacion

### Layout resultante

```text
[ Cliente (dropdown)        ] [ Fecha de Factura          ]
                              [ Fecha de Vencimiento      ]
```

O en una sola fila de 3 columnas si caben:

```text
[ Cliente ] [ Fecha de Factura ] [ Fecha de Vencimiento ]
```

Se usara un grid de 3 columnas (`sm:grid-cols-3`) para aprovechar el espacio.

### Archivos afectados
- **Migracion SQL**: nueva columna `issue_date` en tabla `invoices`
- **`src/pages/InvoiceForm.tsx`**: nuevo estado, nuevo campo de fecha, inclusion en payload

