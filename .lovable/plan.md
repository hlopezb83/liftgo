## Bug encontrado

`parseCfdiXml` está duplicando los impuestos. La función `sumImpuestos` (y `sumRetencionByImpuesto`) recorre **todos** los nodos `<cfdi:Traslados>` / `<cfdi:Retenciones>` del documento, sin distinguir niveles. En un CFDI 4.0 normal hay dos niveles:

1. Dentro de cada `<cfdi:Concepto>` (impuestos por línea).
2. Dentro del `<cfdi:Impuestos>` hijo directo del `<cfdi:Comprobante>` (totales del comprobante).

Tu XML trae ambos, así que el modal recibe el doble:

| Campo          | XML real | Cargado hoy |
| -------------- | -------- | ----------- |
| IVA trasladado | 1,600.00 | 3,200.00    |
| Retención IVA  | 1,067.00 | 2,134.00    |
| Retención ISR  | 125.00   | 250.00      |
| Subtotal       | 10,000   | 10,000 ✓    |
| Total          | 10,408   | 10,408 ✓    |

Por eso "no cuadra": subtotal y total están bien (vienen de atributos del `Comprobante`), pero los impuestos vienen al doble y el total calculado en el form deja de cuadrar con el XML.

## Plan

Corregir `src/features/accounts-payable/lib/parseCfdiXml.ts` para leer los impuestos **únicamente** del nodo `<cfdi:Impuestos>` que es hijo directo del `Comprobante` (totales oficiales del CFDI). Si por alguna razón no existe ese nodo (CFDI sin impuestos), devolver 0.

### Cambios

1. **`src/features/accounts-payable/lib/parseCfdiXml.ts`**
   - Nueva helper `getComprobanteImpuestosNode(comprobante)` que devuelve el `<cfdi:Impuestos>` **hijo directo** del `Comprobante` (no los anidados en conceptos).
   - Reescribir `sumImpuestos` y `sumRetencionByImpuesto` para que reciban ese nodo y sólo sumen sus hijos directos `Traslados>Traslado` / `Retenciones>Retencion`.
   - Preferir los atributos `TotalImpuestosTrasladados` y `TotalImpuestosRetenidos` cuando estén presentes (ya vienen agregados por el PAC); usarlos como `taxAmount` total, y desglosar IVA/ISR de retención recorriendo solo los hijos directos del nodo de impuestos del comprobante.
   - Si no existe el nodo (CFDI sin impuestos), todo queda en 0.

2. **Test** (nuevo) `src/features/accounts-payable/lib/__tests__/parseCfdiXml.test.ts`
   - Caso con doble nivel (concepto + comprobante) usando el XML de Melissa Ramírez como fixture inline: esperar `taxAmount=1600`, `retentionIva=1067`, `retentionIsr=125`, `subtotal=10000`, `total=10408`.
   - Caso sin nodo `Impuestos` (CFDI exento): todos en 0.

3. **Changelog v6.89.1 (patch)**
   - `public/changelog.json`: nueva entrada al inicio.
   - `public/changelog/v6.89.1.json`: descripción del fix ("Corregido cálculo duplicado de IVA y retenciones al importar XML de CFDI en factura de proveedor").

### Fuera de alcance

- No se toca el `SupplierBillFormDialog` ni el dropzone — sólo el parser.
- No se toca `parse-cfdi-expense` (edge function) porque ese flujo distinto vive en otro módulo.