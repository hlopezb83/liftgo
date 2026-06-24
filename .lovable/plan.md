# Diagnóstico: las facturas CXP-0001..0005 no deben volver

## Qué encontré

1. **No existen en la base de datos.** La numeración actual arranca en `CXP-0006` (capturada el 2026-03-20 a las 00:09). No hay registro de las 0001..0005 en `supplier_bills` ni rastro alguno en `audit_logs`.
2. **El revert del chat no restaura datos.** Solo revierte código y migraciones aprobadas; las filas eliminadas o nunca creadas no regresan automáticamente.
3. **Match exacto con los montacargas vendidos.** En `forklifts` hay 5 unidades con `status='sold'` y `acquisition_cost > 0`, todas actualizadas entre el 2026-03-12 y 2026-03-20 (justo antes de CXP-0006):

   ```text
   MCDLC100A48/001     882,232.43
   MCDLC50A048/001     547,311.70
   MCAPC035A048/002    394,255.15
   MCAPC035A048/004    394,255.15
   MCLTC025A048/007    316,794.00
   ```

   Cuadran número (5) y fecha con las 5 facturas faltantes. Casi con seguridad **CXP-0001..0005 fueron las facturas de costo de venta que generaba automáticamente `insertCostoVentaIfSold`** al marcar cada montacargas como vendido.

## Por qué no debemos recrearlas

En `v6.92.0` consolidamos COGS en una sola fuente: el RPC del Estado de Resultados ahora calcula el costo de equipos vendidos a partir del valor en libros del forklift en el mes de venta. Si volvemos a meter esas 5 facturas con categoría `costo_venta`, **regresa el doble conteo** que acabamos de quitar: el RPC sumaría el valor en libros *y* las facturas manuales, inflando el COGS y reduciendo la utilidad.

Es decir: **su ausencia es el estado correcto post-fix**, no un dato perdido.

## Qué propongo hacer

1. **No restaurar CXP-0001..0005.** Dejarlas fuera. El COGS de esos 5 montacargas ya está reflejado en el Estado de Resultados a través de la línea `(-) Costo de Equipos Vendidos` calculada por el RPC sobre el valor en libros.
2. **Validar visualmente el ER del mes de venta** (marzo y mayo 2026, según el `updated_at` de los sold) para confirmar que el COGS aparece con los montos esperados (≈ 2.53 M de los 4 vendidos en marzo + el de mayo).
3. **Reservar el rango `CXP-0001..0005` o no.** Decisión menor: podemos dejarlo con hueco (más simple, conserva trazabilidad histórica) o recomprimir la secuencia. Recomiendo dejarlo con hueco; recomprimir números de documentos contables no es buena práctica.
4. **Documentar el caso en el changelog `v6.92.1`** (patch, docs): explicar que CXP-0001..0005 quedaron vacías por diseño tras la unificación de COGS, para que el equipo no intente "rellenarlas" después.

## Pregunta abierta

Si tú recuerdas haber capturado alguna de esas 5 a mano (no auto-generada), dímelo y la recapturamos como `CXP-####` nueva con los datos que tengas — pero según los rastros del sistema, todo apunta a que eran las automáticas.

## Detalles técnicos

- Tablas revisadas: `supplier_bills` (filtrando `bill_number ILIKE 'CXP-%'`), `audit_logs` (sin coincidencias para 0001..0005), `forklifts` (`status='sold'`).
- Código relevante ya removido en v6.92.0: `insertCostoVentaIfSold` en `src/features/fleet/hooks/forklifts/useForkliftMutations.ts`.
- Fuente de verdad actual del COGS: RPC del Estado de Resultados, consumido por `src/features/reports/hooks/incomeStatement/useMonthlyData.ts` (`cogsForkliftSales` + breakdown).
