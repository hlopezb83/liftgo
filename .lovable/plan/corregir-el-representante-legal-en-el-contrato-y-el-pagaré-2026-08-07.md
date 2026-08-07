# Corregir el Representante Legal en el contrato y el pagaré

## Qué está pasando

Revisé los datos reales del contrato CTR-0002 / CTR-0003 (cliente HYVA DE MEXICO):

- El cliente **no tiene capturado** el campo "Representante Legal" (está vacío).
- El campo "Persona de contacto" del cliente dice **ROSA MARTÍNEZ VIDALES**.
- El **Testigo 2** del contrato es **ROSA HILDA MARTINEZ VIDALES**.

El pagaré (Anexo B) tiene una regla de respaldo: si no hay representante legal, imprime la persona de contacto. Como en este cliente la persona de contacto es la misma persona que se usó como testigo, en el PDF parece que "el sistema toma al testigo como representante legal". En realidad nunca lee los testigos: rellena el hueco con el contacto.

El sistema no está mezclando testigos con el representante; el problema es que rellena un dato legal con un dato que no lo es.

## Cambios propuestos

1. **Quitar el respaldo indebido en el pagaré**: si el cliente no tiene representante legal capturado, imprimir la línea en blanco (`______________________`) para firmarse a mano, en lugar de usar la persona de contacto.
2. **Aviso en el formulario de contrato**: mostrar una advertencia visible cuando el cliente seleccionado no tenga representante legal, con enlace directo a la ficha del cliente para capturarlo (el contrato y el pagaré saldrán incompletos si falta).
3. **Validación suave al generar PDF**: si falta el representante legal, avisar con un toast antes de descargar, sin bloquear la generación.
4. **Separar visualmente testigos y representante**: dejar explícito en el pagaré que los testigos del contrato no participan como suscriptor ni aval (sin cambios de contenido legal, solo asegurar que no haya cruce de datos).
5. Actualizar el changelog (`public/changelog.json` + `public/changelog/vX.Y.Z.json`) como patch.

## Detalle técnico

- `src/lib/pdf/documents/contract/PagareAnnex.tsx`: eliminar `|| customer?.contact_person` en la línea "Representante Legal".
- `src/lib/pdf/contract/placeholders.ts`: mantener el fallback legible `[Representante Legal]` (no cambia).
- `src/features/contracts/components/contracts/ContractForm*`: alerta cuando `customer.representante_legal` esté vacío.
- `ContractPDFButton.tsx`: aviso previo (`notify`) cuando falte el dato.
- Prueba en `src/lib/pdf/documents/__tests__/documents.smoke.test.tsx`: caso con `representante_legal: null` y `contact_person` presente → no debe aparecer el contacto.

## Nota aparte

En HYVA conviene capturar el representante legal real en la ficha del cliente; si ROSA HILDA MARTÍNEZ VIDALES sí es la representante legal, no debería firmar además como testigo del mismo contrato.
