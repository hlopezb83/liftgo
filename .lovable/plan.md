## R23 — Fase 4 (últimos pendientes)

Las fases 1–3 ya cubrieron los críticos y altos (R23-1, R23-2, A, B, C, D, E, F, G, H, I, J). Verifiqué en el código lo que sigue abierto.

### Medios

**R23-K — Volver a elegir el mismo archivo**
En `BankStatementUploader.tsx` el `<input type="file">` no limpia su valor, así que reintentar con el mismo archivo no dispara nada. Limpiar `e.target.value` tras el `onChange`.

**R23-M — Orden de columnas con valores vacíos**
Confirmé 10 columnas con `accessorFn: (x) => x.campo || ""` en Clientes (rfc, email, teléfono, contacto), Facturas (cliente, vencimiento) y Contratos (cliente, equipo, inicio, fin). Eso convierte `null` en `""` y los "—" quedan al inicio en ASC. Dejar que el `null` llegue al comparador (que ya lo ordena al final) y mostrar "—" solo en la celda. Prueba unitaria del orden con nulos.

**R23-N — Impresión limpia**
Marcar con `no-print` (la clase ya existe) las toolbars de listas, buscadores, tabs de estatus, paginador de `DataTableV2`, el FAB de feedback y los controles del estado de cuenta del portal (Descargar PDF, switch de saldo, botones Pagar). Además, en `@media print` forzar tabla de escritorio y ocultar `MobileCardList` vía data-attributes, para que el A4 no salga con tarjetas móviles.

**R23-O — Validación del formulario de prospecto**
Quitar el `required` nativo del campo Empresa, agregar `noValidate` al form y mostrar el mensaje de Zod en español bajo el campo (mismo patrón que `dealValueError`), en lugar de la burbuja del navegador.

**R23-L — Confirmación masiva de conciliación**
Hoy una sugerencia obsoleta aborta todo el lote. Cambiar la RPC `confirm_bank_matches` para procesar línea por línea capturando el conflicto de índice único y devolver `(confirmed, failed, failed_ids)`; la UI mostrará "X conciliados, Y omitidos por conflicto" y dejará las fallidas como `unmatched` para reintentar. Es el punto más delicado de la tanda (migración + cambio de contrato de la RPC).

### Bajos (una pasada)

1. Sentence case: "Sin Pagar" → "Sin pagar" en `constants.ts` (y el residual de la toolbar de facturas si sigue existiendo).
2. Footer del `FormDialog`: fondo sólido y más padding inferior para que no se transparenten los inputs.
3. Arrastrar a etapas que exigen valor de trato: abrir el diálogo en vez de mover directo.
4. Borrar el código muerto del Kanban (rama `cerrado_ganado` y copy inalcanzable).
5. Trigger `enforce_payment_within_invoice_total`: rechazar pagos en facturas canceladas (defensa a nivel API).
6. Toast "Sin conexión": descartarlo cuando el reintento tiene éxito.
7. Atajo "C" anunciado en el panel de conciliación: implementarlo o quitar el texto.
8. `key` duplicada en el preview de importación (`hash` + índice).
9. Reimportación sin movimientos nuevos: no crear registro de importación vacío y avisar "Archivo ya importado".
10. "% conciliado": excluir las líneas ignoradas del denominador.
11. `VirtualBody`: alinear alineación de columnas y zebra con `BodyV2`.

Quedan fuera por ser decisiones de diseño ya tomadas: el umbral de compactación del eje Y (punto 8 del reporte) y `version.json` (ya se regenera con cada entrega).

### Detalles técnicos

- Tests: unitarios para el orden con nulos y para la nueva RPC de confirmación masiva; ajuste del E2E de conciliación para el lote parcial.
- Migración nueva para `confirm_bank_matches` y para el trigger de pagos; sin cambios de esquema.
- Cierre con `public/changelog.json` + `public/changelog/v7.256.0.json` + `public/version.json` (minor: cambia el contrato de una RPC).
