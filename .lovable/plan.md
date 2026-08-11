# Encabezado y ancho de las páginas de formulario

## Qué se ve incoherente

Comparé la pantalla de "Editar contrato" con su vista de detalle y con el resto de los formularios (reservas, cotizaciones, equipos, facturas):

1. **Navegación duplicada y desalineada.** Arriba ya está la ruta `Contratos › CTR-0003 › Editar`, y justo debajo aparece otra vez un botón "Volver" pegado a la izquierda del título. Además el botón queda alineado a la altura del texto grande, lo que hace ver el título "descentrado" y el bloque desbalanceado.
2. **El formulario no está centrado.** El contenido tiene ancho máximo de formulario (~768 px) pero se pega al borde izquierdo, mientras el encabezado abarca todo el ancho de la pantalla (1600 px). Resultado: media pantalla vacía a la derecha y un encabezado que "no cuadra" con la tarjeta de abajo.
3. **El encabezado no dice qué se está editando.** Solo dice "Editar contrato"; el número CTR-0003 vive únicamente en la ruta de arriba.
4. **Detalle del contrato (bug de etiqueta):** en "Condiciones de Uso" aparece un valor `0` sin ninguna etiqueta arriba — es el Interés Moratorio, que pierde su título cuando vale 0.

## Cambios propuestos

1. **Encabezado de formularios unificado**
   - Quitar el botón "Volver" en línea con el título; la ruta de arriba ya cumple esa función y el botón "Cancelar" al pie del formulario también regresa.
   - Conservar un solo control de regreso discreto arriba del título (flecha + "Volver") en su propio renglón, alineado con el bloque de texto, igual en todos los formularios.
   - Añadir subtítulo con el registro editado: "Editar contrato" + "CTR-0003". En alta, subtítulo con el contexto (por ejemplo el cliente prellenado) o sin subtítulo.

2. **Centrar el contenido de formulario**
   - Las páginas con ancho de formulario se centran horizontalmente (encabezado y tarjetas dentro del mismo bloque centrado), de modo que el título quede alineado con las tarjetas y no haya un vacío desproporcionado a la derecha.
   - Aplica a los cinco formularios que usan este ancho: contratos, reservas, cotizaciones, equipos y changelog.

3. **Alinear la vista de detalle de contrato**
   - Mismo patrón de regreso (flecha + "Volver" con etiqueta, no una flecha suelta) para que detalle y edición se vean como la misma familia.

4. **Corregir la etiqueta faltante** del Interés Moratorio en el detalle cuando el valor es 0.

5. Actualizar el changelog como versión patch.

## Detalle técnico

- `src/components/layout/PageContainer.tsx`: agregar `mx-auto` a los anchos `wide`, `form` y `narrow` (el `full` no cambia).
- `src/components/layout/FormPageHeader.tsx`: reestructurar a columna — botón "Volver" arriba, luego `PageHeader` con `title` + `subtitle`; se elimina el `flex items-start gap-2` que lo ponía en línea.
- `src/features/contracts/pages/ContractForm.tsx` y los otros cuatro consumidores de `FormPageHeader`: pasar `subtitle` con el identificador del registro en modo edición.
- `src/features/contracts/pages/ContractDetail.tsx`: usar `backHref`/`backLabel` de `PageHeader` en vez del ícono suelto.
- Revisar el `DetailRow` del interés moratorio en `ContractConditionsCard.tsx`: la etiqueta desaparece por un render condicional sobre un valor falsy (`0`).
- Verificación visual con capturas a 1600x900 de: editar contrato, detalle de contrato y un segundo formulario (cotizaciones) para confirmar que quedan consistentes.
