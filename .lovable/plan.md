

# Agregar botón "Editar Cliente" en la página de detalle

## Problema
No existe ningún botón para editar un cliente existente. La página de detalle (`CustomerDetailPage`) solo muestra datos y el botón de invitar al portal, pero no permite modificar la información del cliente.

## Solución
Agregar un botón "Editar" en el header de `CustomerDetailPage` que abra el mismo diálogo de formulario que ya existe en `CustomersPage`, pero pre-llenado con los datos del cliente actual.

## Cambios

### `src/pages/CustomerDetailPage.tsx`
- Importar los componentes del diálogo de formulario (`Dialog`, `Label`, `Select`, etc.) y los hooks `useUpdateCustomer`, `useFormState`, y el schema `customerFormSchema`.
- Agregar estado para controlar el diálogo de edición (`editOpen`).
- Agregar un botón "Editar" con icono `Pencil` en las `actions` del `DetailPageHeader`.
- Al abrir, pre-llenar el formulario con todos los campos del cliente actual (name, email, phone, rfc, regimen_fiscal, etc.).
- Reutilizar el mismo formulario que ya existe en `CustomersPage` (campos de identidad, datos fiscales, contacto, direcciones, notas).
- Al guardar, usar `useUpdateCustomer` e invalidar queries para refrescar la vista.

### Estructura del botón en el header
```
[Editar]  [Invitar al Portal]
```

El formulario será idéntico al de `CustomersPage` para mantener consistencia.

