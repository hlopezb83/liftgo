# Evidencia operativa antes de aplicar 0127 (sin ejecutar)

## Resultado de la inspección (solo lectura)
- HEAD: `3ba4c640157c730885b606dc3fb3e13f5882a4fc` (coincide). El árbol no está limpio: `public/version.json` aparece modificado, regenerado por la plataforma.
- `0127_invoice_source_transaction.sql`: el SHA256 `41915da9…b334f` coincide. El journal tiene idx127 con `when=1794056400000` y es la última entrada.
- `drizzle.config.ts` lee `LOVABLE_DB_MIGRATION_URL`. **Esa variable NO está en este entorno.**
- drizzle-kit está instalado localmente, pero eso no da una conexión autorizada a producción.

## Respuesta: no puedo ejecutar aquí el runner versionado
Faltan estas capacidades:
1. **Secreto inyectado:** no existe `LOVABLE_DB_MIGRATION_URL`. No hay un mecanismo para inyectarla de forma segura. Tampoco usaré otras credenciales del entorno.
2. **Canal oficial que aplique sólo lo pendiente:** la única herramienta oficial (`lov_database--migration`) pide `name/query` y siempre genera una entrada nueva. Aplicaría 0127 y además crearía una 0128. No ejecuta `drizzle-kit migrate` tal cual.
3. **Exclusión de ejecutores:** ni la herramienta ni Drizzle 0.31.11 tienen advisory lock ni bloqueo del ledger. El contrato (sección Exclusión) lo confirma, así que no puedo garantizar un solo ejecutor durante preflight, migración y postflight.
4. **Atomicidad:** según el contrato, el migrador mete todo el lote pendiente y sus INSERT al ledger en una sola transacción. El bootstrap del ledger queda fuera de ella. No puedo confirmar que el envoltorio de la plataforma conserve esa garantía.

Las discrepancias históricas documentadas no se reparan ni se tocan.

## Opciones (requieren tu decisión)
- **A.** Ejecutar el runner desde un ejecutor externo autorizado, como un workflow manual de GitHub con environment protegido, el secreto y `concurrency` de una sola base. Antes y después se hacen lecturas frescas del ledger.
- **B.** Usar el patrón ya usado en 0105–0110 y 0123/0124: una llamada oficial con un SQL de control revisado. Aplica 0127 y genera un recibo 0128, lo que obliga a actualizar el pin de CI. Requiere tu autorización explícita y un recibo revisado.

No se ejecutará nada hasta que elijas.
