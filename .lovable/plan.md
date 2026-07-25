
# Re-verificación R14 (v7.228.0)

Objetivo: comprobar en el código actual que cada fix del doc `liftgo-diffs-lovable-r14_1.md` quedó exactamente como se pidió. Sin modificar código; sólo reporte.

## Alcance por hallazgo

Para cada uno: abrir el archivo/función objetivo, cotejar contra el diff esperado, marcar OK / DESVIACIÓN (con evidencia línea).

| # | Verificar | Fuente |
|---|-----------|--------|
| R14-A | `useMemo(getRange, [rangeKey])` en `ActivityPage.tsx` | archivo |
| R14-B | `cancel_booking(p_reason)` libera montacargas + no inserta status_log falso | `supabase--read_query` a `pg_proc` |
| R14-C | `catalogsReady` gate en `useForkliftPrefill.ts` + guard en `useForkliftFormLogic.ts` | archivos |
| R14-D | RLS `customer_payment_intents` scoped a customer | `pg_policies` |
| R14-E | `PortalInvoicePayment.tsx`: SPEI oculto no-MXN, moneda mostrada; `approve_payment_intent` usa currency de la factura | archivo + RPC |
| R14-F | `revert_audit_log` usa `old_data`/`new_data` | RPC |
| R14-G | `DeleteAuditLogDialog` sin acción Delete | archivo |
| R14-I | `RecurringInvoicesPreviewDialog`: conteo real + checkboxes informativos | archivo |
| R14-J | `create_booking` rechaza overlap confirmado (daterange) | RPC |
| R14-K | `useInviteUser`/`useDeleteUser`/`useResetPassword` con `invokeEdgeFunction`+`extractEdgeErrorMessage` | archivos |
| R14-L | `useDashboardSections` y `Dashboard` gatean KPIs financieros por rol | archivos |
| M1/M2/M3/M5/M6 | Validaciones `InvoiceForm`, pull-to-refresh Fleet/Maintenance, selector page size 10–100 | archivos |

## Método

Lecturas paralelas de archivos + `supabase--read_query` a `pg_proc.prosrc` y `pg_policies` para las 5 piezas de BD. Sin edits.

## Entregable

Tabla `# | estado | evidencia (archivo:línea o fragmento SQL) | nota`. Si aparece desviación, propongo diff puntual en el próximo turno (no lo aplico aquí).
