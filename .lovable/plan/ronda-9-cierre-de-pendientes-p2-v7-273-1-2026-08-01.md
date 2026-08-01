# Ronda 9 — Cierre de pendientes P2 (v7.273.1)

Los 6 bloqueantes ya están en producción. Faltan los 7 hallazgos P2 de la sección 4 del reporte. Van agrupados en tres bloques.

## Bloque A — Integridad de datos

1. **`rejected_at` queda en NULL al rechazar una cotización**
   Hoy al rechazar sólo se guarda el motivo y el estado. Se agregará la marca de tiempo (en hora de Monterrey) en la misma operación, para que el historial y los reportes sepan *cuándo* se rechazó.

2. **Factura de proveedor pagada que sigue diciendo "Por aprobar" (caso CP-0010)**
   Se revisará si es dato viejo o si el flujo permite pagar sin pasar por aprobación. Primero un diagnóstico con consulta a la base; luego, según resultado, corrección de los registros afectados y/o un candado que impida la combinación pagada + por aprobar.

3. **Error 406 al volver después de borrar una cotización**
   Tras borrar, la pantalla de detalle sigue consultando el registro que ya no existe. Se ajustará la consulta para tolerar "cero filas" y se navegará a la lista limpiando la caché del detalle.

## Bloque B — Mensajes y textos

4. **Sobrepago de cliente bloqueado sin mensaje**
   La validación del portal/registro de pago rechaza el monto pero no siempre muestra el motivo. Se conectará al catálogo de errores existente para que aparezca un aviso claro con el saldo pendiente.

5. **Bitácora con prefijos hexadecimales y actor "Sistema"**
   En `/activity` y auditoría, los cambios sobre roles y perfiles muestran identificadores crudos. Se traducirán a nombres legibles (usuario y rol) y se distinguirá "Sistema (automático)" de "actor no identificado".

6. **Entregas: columna de montacargas en "—"**
   La lista no está trayendo el nombre del equipo aunque el detalle sí lo tiene. Se agregará el dato a la consulta de la lista.

## Bloque C — Interacción

7. **Filtro de fechas: 3 clics + "Aplicar"**
   Se reducirá a un solo gesto: al elegir el rango, el filtro se aplica solo (con rangos rápidos: Hoy, 7 días, Mes actual). Se conserva el comportamiento actual de guardado de filtros al navegar.

## Detalles técnicos

- `useQuoteConversionActions.ts`: agregar `rejected_at: nowMty()` junto al motivo; test unitario.
- CxP: consulta de diagnóstico sobre `supplier_bills` (status vs `amount_paid`), y de ser necesario migración con trigger de consistencia (ya existe `enforce_supplier_bill_status_consistency`, hay que verificar su cobertura).
- Detalle de cotización: `.maybeSingle()` + `removeQueries` de la key del detalle al borrar.
- Sobrepago: reutilizar `PAYMENT_EXCEEDS_BALANCE` de `src/lib/domain/errorCatalog.ts` en el flujo de intents del portal.
- Bitácora: mapa de etiquetas para `user_roles`/`profiles` en las utilidades de auditoría; sin tocar RLS.
- Entregas: incluir el join de `forklifts(name, model)` en el hook de la lista.
- Datepicker: aplicar al cerrar el popover, sin botón "Aplicar".
- Cierre: `bunx vitest run` completo, typecheck, y entrada nueva en `public/changelog.json` + `public/changelog/v7.273.1.json`.

## Alcance excluido

No se tocan los ítems refutados del reporte (CxP futuras "Vencida", SPEI, Devtools) ni el flujo de mecánico/portal, que quedaron en verde.
