# Proveedor GAM LEON no se reconoce al importar el XML

## Qué encontré (verificado en la base de datos)

- El XML es del emisor **GAM LEON**, RFC **GLE2112131B2**.
- El proveedor "GAM LEON" (id `4736e98b…`) existe y **no está eliminado**, pero su campo **RFC está vacío (null)**.
- **El RFC nunca se perdió: nunca se guardó.** La bitácora de auditoría de ese registro tiene una sola entrada: el alta del 25-mar-2026, y ya en ese momento el RFC venía vacío. No existe ninguna edición posterior que lo haya borrado.
- No es un caso aislado: la mayoría de los proveedores dados de alta en marzo (carga inicial) quedaron sin RFC (BBVA BANCOMER, CERTOK, EFEX PAY, GOOGLE ADS, etc.). Los capturados de mayo en adelante sí traen RFC.
- Ya se registró antes una factura de GAM LEON con XML (CXP-0179, del mismo emisor GLE2112131B2), pero **importar un CFDI no escribe el RFC en el proveedor**, así que el dato siguió vacío.

Analogía: el ERP busca al proveedor por su "credencial" (RFC). A GAM LEON nunca se le llenó la credencial en el alta masiva, así que aunque esté en la lista, el buscador no lo encuentra.

## Qué se va a hacer

1. **Corregir el dato**: guardar `GLE2112131B2` en el proveedor GAM LEON.
2. **Coincidencia por nombre como respaldo**: si no hay match por RFC, buscar por nombre normalizado (sin acentos, puntuación ni sufijos societarios). Si hay una sola coincidencia, se preselecciona el proveedor y se avisa que el match fue por nombre.
3. **Autocompletar el RFC faltante**: cuando el proveedor se identifica por nombre y no tiene RFC, ofrecer en el modal la acción "Guardar RFC del CFDI en el proveedor". Así el siguiente XML empata directo.
4. **Normalizar la comparación de RFC** (quitar espacios/guiones, mayúsculas) en ambos lados.
5. **Aviso más útil** cuando no hay match: mostrar RFC y nombre del emisor.
6. **Reporte de proveedores sin RFC**: indicador en la lista de Proveedores para detectar los registros de la carga inicial que siguen incompletos.
7. Actualizar CHANGELOG y versión (minor).

## Detalles técnicos

- Nuevo helper puro `src/features/accounts-payable/lib/matchSupplierByCfdi.ts`: recibe `{ emitterRfc, emitterName }` + lista de proveedores y devuelve `{ supplierId, matchedBy: "rfc" | "name" | null }`. Incluye `normalizeRfc` y `normalizeCompanyName` (elimina SA DE CV, S DE RL, SAPI, puntuación y acentos).
- `useImportSupplierBillCfdi.ts` usa el helper y expone `matchedBy` para que el modal muestre el aviso y la acción de guardar RFC.
- La acción de guardar usa el mutation de actualización existente de `useSuppliers` e invalida su query.
- Tests Vitest del helper: RFC exacto, RFC con formato sucio, nombre único, nombre ambiguo (no matchear), sin coincidencia.
- Corrección puntual del RFC de GAM LEON mediante actualización de datos (no migración de esquema).
- `parseCfdiXml.ts` no se modifica: ya extrae bien `emitterRfc` y `emitterName`.
