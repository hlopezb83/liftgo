# Reconocer al proveedor al importar el XML (CFDI)

## Qué está pasando

El XML es del emisor **GAM LEON**, RFC **GLE2112131B2**.

En la base de datos ese proveedor **sí existe** ("GAM LEON"), pero su campo **RFC está vacío**.

El importador de XML busca al proveedor **únicamente comparando el RFC del emisor** contra el RFC guardado. Como el registro no tiene RFC, no hay coincidencia y aparece "Proveedor no encontrado por RFC".

Analogía: el ERP busca al proveedor por su "número de credencial"; la credencial de GAM LEON está en blanco, así que aunque el proveedor esté en la lista, no lo encuentra.

## Qué se va a hacer

1. **Normalizar la comparación de RFC**: quitar espacios, guiones y mayúsculas/minúsculas en ambos lados antes de comparar (hoy solo se hace mayúsculas).
2. **Coincidencia secundaria por nombre**: si no hay match por RFC, buscar por nombre normalizado (sin acentos, sin "S.A. de C.V.", sin puntuación). Si hay exactamente una coincidencia, se preselecciona el proveedor y se avisa que el match fue por nombre, no por RFC.
3. **Ofrecer guardar el RFC faltante**: cuando el proveedor se identifica por nombre y no tiene RFC registrado, mostrar en el modal un aviso con acción "Guardar RFC en el proveedor" que actualice el registro con el RFC del CFDI. Así el siguiente XML ya empata directo.
4. **Mensaje de aviso más útil**: en vez de solo "Proveedor no encontrado por RFC", indicar el RFC y el nombre del emisor para facilitar la selección manual.
5. Actualizar CHANGELOG y versión (patch/minor según alcance final).

## Detalles técnicos

- `src/features/accounts-payable/hooks/useImportSupplierBillCfdi.ts`: extraer `matchSupplierId` a un helper puro nuevo (`../lib/matchSupplierByCfdi.ts`) que reciba `{ emitterRfc, emitterName }` y la lista de proveedores, y devuelva `{ supplierId, matchedBy: "rfc" | "name" | null }`.
- Normalizadores: `normalizeRfc` (trim, upper, quitar no alfanuméricos) y `normalizeCompanyName` (upper, quitar acentos, puntuación y sufijos societarios: SA DE CV, S DE RL, SAPI, etc.).
- Tests Vitest para el helper: match por RFC exacto, RFC con formato sucio, match por nombre único, nombre ambiguo (no matchear), sin coincidencia.
- La acción "Guardar RFC" usa el mutation existente de actualización de proveedores (`useSuppliers` update) e invalida su query.
- No se modifica el parser `parseCfdiXml.ts` (ya extrae correctamente `emitterRfc` y `emitterName`).
