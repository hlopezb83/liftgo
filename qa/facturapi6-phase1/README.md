# Fase 1 — capa Facturapi 6.0.0 (preparada, NO desplegada)

Plan: `.lovable/plan/migrar-el-erp-a-facturapi-6-0-0-2026-11-10.md`.

## Por qué está aquí y no en las funciones

En este proyecto, cualquier cambio dentro de las funciones fiscales del backend se despliega automáticamente al backend en vivo. Para cumplir "sin desplegar", la Fase 1 se entrega como:

- `phase1.patch`: diff unificado `-p1` contra las funciones actuales (sha256 `c760592ad568929f1b6e30a186b062b2cadbfac12255eabee2aef1d747c6f4c0`).
- `staged/`: copias de los archivos resultantes, para revisión.

Aplicar el parche = desplegar. Sólo tras revisión independiente y con autorización explícita (activación "todo de una vez").

## Cambios

| Archivo | Cambio |
|---|---|
| `deno.json` | `facturapi` 5.2.0 → **6.0.0** |
| `_shared/facturapi/client.ts` | Capa del candidato revisado (967ac99): fechas `Date`, AbortSignal por llamada, errores con `logId`/`code`, binarios |
| `_shared/facturapi/withTimeout.ts` | Igual al candidato |
| `_shared/facturapi/sdk6_contract_test.ts` | Nuevas pruebas de contrato SDK 6 (del candidato) |
| `_shared/facturapi/sdk5_contract_test.ts` | Eliminado (contrato de 5.2) |
| `reconcile-stamping-invoices/recoverCreditNotePdf.ts` | **Corrección necesaria**: usaba el transporte interno de 5.2 (`invoices.client.get`), que no existe en 6. Con 6 la recuperación de PDF de notas de crédito quedaba siempre "pendiente". Ahora usa `retrieveInvoiceWithSignal`/`downloadInvoicePdfWithSignal` de la capa compartida (con timeout y abort). |
| `reconcile-stamping-invoices/recoverCreditNotePdf_sdk_test.ts` | Ajustada a SDK 6 (sin ganchos internos); mismas reglas: 10 MiB, abort, sin subida tardía |

Los manejadores de factura, REP, NC, cancelación y descarga no cambian: ya eran idénticos al candidato.

## Validación (sólo local, sin red)

- Copia aislada en `/tmp`, `deno check` de todos los `.ts` de las funciones con 6.0.0: **0 errores**.
- `deno test --deny-net` en todas las funciones fiscales (excepto `index_test.ts`, que son pruebas HTTP contra el backend real): **1016 pasan, 0 fallan**.
- Antes de la corrección: 7 fallas en recuperación de PDF de NC (regresión real detectada).
- El parche aplicado sobre una copia limpia reproduce byte a byte el árbol probado.
- Pendiente en CI: suite completa. No se emitió ningún documento ni se llamó al proveedor.

## Para aplicar (después de revisión)

Copiar los archivos de `staged/` a sus rutas y borrar el de `DELETIONS` — eso despliega. Después: Fase 3 (sandbox con crons pausados en la ventana).
