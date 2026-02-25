

# Feature 1: Boton para Generar Facturas Recurrentes

## Que hace
Agrega un boton "Generar Facturas Recurrentes" en la pagina de Facturas que ejecuta manualmente la funcion backend que revisa todas las reservas con facturacion recurrente y genera borradores de facturas para las que tienen 30+ dias sin facturar.

## Como funciona
- El boton aparece en la barra de acciones de la pagina de Facturas, junto a "Exportar CSV" y "Nueva Factura"
- Solo visible para roles `admin` y `administrativo` (usando `RoleGuard`)
- Al hacer clic, llama a la edge function `generate-recurring-invoices` existente
- Muestra un toast con el resultado: cuantas facturas se generaron, o si no habia ninguna pendiente
- Muestra un spinner mientras se ejecuta

## Cambios tecnicos

### Archivo: `src/pages/InvoicesPage.tsx`
- Importar `RoleGuard`, `supabase`, `useState`, `toast`, y el icono `RefreshCw` de lucide
- Agregar estado `isGenerating` para controlar el spinner del boton
- Agregar funcion `handleGenerateRecurring` que:
  - Llama a `supabase.functions.invoke("generate-recurring-invoices")`
  - Muestra toast de exito con `invoicesCreated` o mensaje de "no hay facturas pendientes"
  - En error, muestra toast de error
  - Refresca la lista de facturas al terminar
- Envolver el boton en `RoleGuard allowed={["admin", "administrativo"]}` para que auditores y otros roles no lo vean
- El boton usa `variant="outline"` y el icono `RefreshCw` con animacion de spin durante la carga

### Sin cambios en backend
La edge function `generate-recurring-invoices` ya existe y funciona correctamente. Solo se agrega el boton frontend para invocarla.

## Resultado
- Admin/Administrativo ve el boton "Generar Recurrentes" en la pagina de Facturas
- Al hacer clic, se generan automaticamente los borradores pendientes
- Se muestra feedback claro del resultado

