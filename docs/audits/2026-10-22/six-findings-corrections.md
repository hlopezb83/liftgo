# Correcciones focales de seis hallazgos

Versión preparada: 8.44.29. Base revisada: 7009ea3aafa95036cbde6bfd3f66ea1f9a305232 (8.44.28).

## Alcance

1. El resolutor de acceso portal exige una organización existente y activa antes de leer documentos o acceder a Storage/PAC. Una consulta fallida devuelve 503; una organización suspendida, ausente o de estado desconocido devuelve 403. Conserva los controles de cuenta, membresía y pertenencia del documento.
2. El detalle de ingresos mensuales usa la validación monetaria canónica: una factura USD con TC nulo, cero o uno no produce un importe MXN aparentemente válido. La pantalla muestra «Sin T.C.» y el CSV deja vacíos los importes desconocidos.
3. El detalle de utilización representa carga y error de reservas independientemente del agregado; conserva el resumen válido y permite reintentar únicamente esa consulta. No presenta una consulta fallida como cero reservas.
4. La exportación de rentabilidad entrega importes redondeados de tipo numérico al exportador. Las pérdidas se conservan como números y los textos siguen protegidos contra fórmulas.
5. Mantenimiento presenta carga explícita y no permite exportar antes de disponer de filas; conserva el estado de error y su reintento.
6. Inventario selecciona la refacción por identidad y resuelve el detalle con los datos actuales. El siguiente ajuste usa el stock actualizado; un ajuste que ya está abierto conserva su snapshot y no elude la defensa de concurrencia.

## Regresiones permanentes

- download-cfdi/handler_test.ts: suspensión, organización ausente, estado desconocido/nulo, fallo de consulta y pertenencia. Los casos denegados verifican ausencia de lectura de documentos/secretos, descarga, PAC y escrituras.
- drilldown.test.ts y MonetaryExports.test.tsx: TC inválido/válido, propagación de desconocidos en UI/CSV, pérdidas/ganancias y nombre con fórmula. Se inspeccionan los bytes reales del CSV; no equivale a abrir Excel nativo.
- reportQueryStates.test.tsx: carga, error, reintento y vacío legítimo de los reportes afectados.
- InventoryPage.stockRefresh.test.tsx: dos ajustes consecutivos, refresh concurrente con diálogo abierto y desaparición de la fila.

## Activación y límites

No requiere SQL, cambios de permisos, credenciales, configuración JWT ni operaciones fiscales. El frontend y la función download-cfdi tienen activación independiente: publicar la web no acredita que la función haya sido desplegada. Ninguna otra función consume resolvePortalAccess en esta base.

CI del commit final, revisión de la identidad publicada y recibo del despliegue de download-cfdi deben comprobarse antes de declarar el lote activo. Las pruebas de suspensión usan un entorno simulado; no se suspende una empresa operativa para ensayar. No se modifican permisos financieros del despachador ni se resuelven por inferencia otros pendientes del producto.
