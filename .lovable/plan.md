

## Hacer seleccion de cliente obligatoria en cotizaciones

### Problema
Actualmente el formulario de cotizaciones permite escribir un nombre de cliente manualmente sin seleccionar uno del catalogo. Se necesita que la seleccion de cliente sea obligatoria desde el dropdown, eliminar el campo de texto libre, y mostrar una nota orientativa.

### Cambios

**1. `src/components/CustomerSelector.tsx`** - Agregar props opcionales

- Nueva prop `required?: boolean` - cuando es true, cambia el placeholder a "Seleccionar cliente *" y no muestra "(opcional)"
- Nueva prop `hideManualName?: boolean` - cuando es true, oculta el campo de texto "Nombre del Cliente"
- Nueva prop `helpText?: string` - texto de ayuda que se muestra debajo del dropdown (para la recomendacion)
- El componente sigue funcionando igual para BookingForm (que no pasa estas props)

**2. `src/pages/QuoteForm.tsx`** - Usar las nuevas props

- Pasar `required`, `hideManualName` y `helpText` al CustomerSelector
- El `helpText` dira: "Si tu cliente no aparece en la lista, selecciona 'Publico en General' o registralo primero en el modulo de Clientes."
- Agregar validacion en `handleSubmit`: si no hay `customerId`, mostrar error "Selecciona un cliente"
- Eliminar el estado `customerName` del flujo (se llenara automaticamente al seleccionar cliente)

### Flujo de usuario

1. El usuario ve el dropdown de cliente con placeholder "Seleccionar cliente *"
2. Debajo del dropdown aparece un texto gris con la recomendacion
3. Si intenta guardar sin seleccionar cliente, ve el error "Selecciona un cliente"
4. No hay campo de texto para escribir nombre manualmente

### Lo que NO cambia
- BookingForm sigue funcionando igual (no pasa las nuevas props)
- La tabla de base de datos no cambia
- El campo `customer_name` se sigue guardando (tomado del cliente seleccionado)

### Detalle tecnico
- 2 archivos modificados (CustomerSelector.tsx, QuoteForm.tsx)
- Sin migraciones de base de datos

