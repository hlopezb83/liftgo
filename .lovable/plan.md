# Auditoría: "Firmado por" e "Interés moratorio" no llegan al PDF del contrato

## Qué encontré (verificado en datos reales)

Revisé el contrato CTR-0003 y el resto:

| Contrato | Firmado por | Interés moratorio |
|---|---|---|
| CTR-0001 | ALEJANDRO MORENO PEREZ | 5 |
| CTR-0002 | MAHA MESTASSI | 0 |
| CTR-0003 | MAHA MESTASSI | 0 |

Los datos **sí se guardan** correctamente desde el formulario de editar contrato. El problema está del lado del PDF:

1. **"Firmado por" nunca se imprime.** El generador de PDF trae el campo `signed_by`, pero ningún bloque del documento lo usa: el recuadro de firma de EL ARRENDATARIO imprime el nombre del cliente y, como subtítulo, el representante legal. No existe placeholder `{firmado_por}` en el registro de plantillas. Es un dato que se captura y se queda solo en la pantalla de detalle.

2. **El interés moratorio se sustituye por 5% cuando vale 0.** El PDF calcula el valor como "el capturado *o* 5". En programación, el `0` cuenta como "vacío", así que un 0% capturado se convierte en 5% impreso. Los dos contratos con 0 salen con 5% en la cláusula CUARTA y en el pagaré. La plantilla en base de datos sí contiene los placeholders correctos, no es problema de plantilla.

Analogía: es como una forma donde escribiste "0 pesos de multa" y la impresora, al ver un cero, decide que dejaste el campo en blanco y estampa el valor de fábrica.

## Cambios propuestos

1. **Imprimir "Firmado por" en el contrato**
   - Nuevo placeholder `{firmado_por}` disponible en las plantillas editables.
   - En el recuadro de firma de EL ARRENDATARIO: si hay "Firmado por", se imprime como la persona que firma (`Firma: NOMBRE`), debajo del nombre del cliente, junto al representante legal cuando ambos existan.
   - Si está vacío, se conserva el comportamiento actual (línea sin nombre).

2. **Respetar el 0% de interés moratorio**
   - Sustituir la lógica "valor o 5" por "usa el 5 solo si el dato es nulo/indefinido". Un 0 capturado imprimirá 0%.
   - Mismo criterio para "Horas máximas por mes" y "Tarifa por hora extra", que tienen exactamente el mismo defecto.

3. **Aviso en el formulario**: al dejar Interés Moratorio en 0, mostrar texto de ayuda indicando que se imprimirá "0%" en el contrato y el pagaré (para que sea una decisión consciente, no un descuido).

4. **Pruebas** que fijen ambos comportamientos: PDF con `late_interest_rate: 0` debe decir 0%, y PDF con `signed_by` debe contener ese nombre.

5. **Changelog** como versión patch (corrección de datos que no llegaban al documento).

## Detalle técnico

- `src/lib/pdf/contract/placeholders.ts`: helper `numOr(value, fallback)` con chequeo `== null` en lugar de `||`; aplicarlo a `interes_moratorio`, `horas_max` y `tarifa_extra`. Añadir `firmado_por` a `buildPlaceholderVars` (fallback `""`).
- `src/lib/pdf/contract/placeholderRegistry.ts`: registrar `{firmado_por}`.
- `src/lib/pdf/documents/contract/ContractBody.tsx`: componer `rightSub` con representante legal y/o `contract.signed_by`.
- `src/features/contracts/components/ContractFormSections.tsx`: `FormDescription` en `late_interest_rate`.
- `src/lib/pdf/documents/__tests__/documents.smoke.test.tsx` (+ `src/test/contractPlaceholders.test.ts`): casos con `late_interest_rate: 0` y `signed_by` presente.
- `package.json`, `CHANGELOG.md`, `public/changelog.json`, `public/changelog/vX.Y.Z.json`.
