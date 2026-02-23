
# Bloquear alta de montacargas sin modelos configurados

## Problema

Actualmente, cuando no hay modelos de equipo configurados en el catalogo, el formulario de "Agregar Montacargas" permite escribir fabricante y modelo como texto libre. Esto puede causar datos inconsistentes y sin estandarizar.

## Solucion

Cuando no existan modelos de equipo registrados y el usuario intente crear un montacargas nuevo (no aplica para edicion), mostrar un mensaje de alerta informativo en lugar del formulario, indicando que primero debe configurar al menos un modelo en el modulo de Configuracion de Operaciones.

### Cambios en `src/pages/ForkliftForm.tsx`

1. **Agregar importacion** del componente `Alert` y el icono `AlertTriangle` de lucide-react.

2. **Mostrar alerta bloqueante** cuando `!isEdit && !hasModels`:
   - Se reemplaza el formulario completo con un mensaje claro:
     - Titulo: "Configura modelos de equipo primero"
     - Descripcion: "Para agregar un montacargas, primero debes registrar al menos un modelo de equipo en Configuracion de Operaciones."
   - Un boton que lleve directamente a `/settings/operations` para facilitar la navegacion.
   - Un boton secundario de "Volver" para regresar a la flotilla.

3. **En modo edicion** (`isEdit`), el formulario sigue funcionando normalmente ya que el equipo ya existe con datos previos, incluso si los modelos del catalogo fueron borrados despues.

4. **Eliminar los inputs de texto libre** (los fallbacks de `Input` para fabricante y modelo cuando `!hasModels`), ya que con esta restriccion nunca se llegaria a ese estado en modo creacion.

### Comportamiento resultante

- **Crear montacargas sin modelos configurados**: Se muestra alerta con enlace a configuracion. No se puede llenar el formulario.
- **Crear montacargas con modelos configurados**: Formulario normal con dropdowns de fabricante y modelo.
- **Editar montacargas existente**: Siempre muestra el formulario completo sin importar si hay modelos o no.
