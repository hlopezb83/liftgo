## Diagnóstico — FAC-0076

Historial en `audit_logs` para la factura `a18eadae…`:

```
21:33:00  UPDATE  cancellation_status: none → pending, cancellation_motive: 03
21:33:16  UPDATE  cancellation_status: pending → none   ← bug
```

O sea:
1. El usuario mandó a cancelar → `cancel-cfdi` guardó `pending` correctamente.
2. 16 segundos después algo pisó `cancellation_status` de vuelta a `"none"`.

Culpable: `supabase/functions/refresh-cancellation-status/handler.ts`.

- Línea 109 declara `const inv = client.invoices as any`, **shadow** de la variable `inv` (la fila de la BD, línea 78). Así que el fallback en línea 137 nunca puede leer el status previo de la BD; lee del SDK.
- `VALID_SAT_STATUSES` incluye `"none"`. Si Facturapi (o su `retrieve()`) devuelve `cancellation_status: "none"` mientras el SAT aún procesa el acuse, el handler lo escribe tal cual y borra el `pending`.
- Además, la UI (`InvoiceDetailActions.tsx`) solo muestra el badge "Cancelación pendiente SAT" cuando el status es exactamente `"pending"`. Al bajarlo a `"none"` desaparece cualquier señal y hasta reaparece el botón "Cancelar CFDI" como si nunca hubiera pasado nada. Nunca se ve nada tampoco cuando la respuesta original ya fue `pending`.

## Cambios

### 1. `supabase/functions/refresh-cancellation-status/handler.ts`
- Renombrar el shadow: `const inv = client.invoices as any` → `const invClient = client.invoices as any` (y usarlo en las 3 llamadas dentro del try). Así el fallback vuelve a apuntar a la fila de la BD.
- Nunca degradar `pending → none`: si Facturapi responde `"none"` (o algo no reconocido) y en la BD ya está `"pending"`, mantener `"pending"`. Solo aceptar transiciones a `accepted / rejected / expired`; si no cae ahí y ya estaba `pending`, no tocar.
- Quitar `"none"` de `VALID_SAT_STATUSES` para este flujo — después de una solicitud de cancelación el SAT no vuelve a `none`.

### 2. `supabase/functions/cancel-cfdi/handler.ts`
- Quitar `"none"` de `VALID_SAT_STATUSES` (misma razón). Si Facturapi devolviera `none` como respuesta a un cancel, coercer a `pending`.

### 3. `src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx`
- La bandera de "cancelación solicitada" debe encender cuando `cancellation_motive` está presente y la factura no está cancelada, aunque `cancellation_status` esté fuera de `pending/rejected` (defensa contra estados intermedios).
- Mostrar badge amarillo "Cancelación solicitada · esperando SAT" y ocultar el botón "Cancelar CFDI" en ese caso.
- El botón "Actualizar estado SAT" queda visible siempre que haya cancelación en proceso.

### 4. Datos — arreglar FAC-0076
Como el handler ya pisó el status: restaurar `cancellation_status = 'pending'` en esa factura (motive ya es `03`). Migración de datos puntual.

### 5. Changelog
`v6.104.4` — patch, category `fix`.
- "Cancelación de CFDI: la UI no avisaba que había una cancelación en curso y refresh-cancellation-status podía borrar el estado pendiente."

Sin cambios de esquema. Sin nuevas dependencias.
