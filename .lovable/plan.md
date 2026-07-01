## Problema

FAC-0076 está `cancelled` en Facturapi pero en LiftGo sigue en `cancellation_status = 'pending'`. El refresh no la sincroniza porque `refresh-cancellation-status/handler.ts` sólo mira `facturApiInv.cancellation_status` y lo compara contra `["accepted","pending","rejected","expired"]`. Facturapi, en cambio, marca la cancelación aceptada bajando el campo raíz **`status` a `"canceled"`** (con "one l"), y muchas veces `cancellation_status` queda vacío o como `"none"`. Con la última corrección que agregamos ("nunca degradar un pending"), la respuesta de Facturapi simplemente se ignora y el estado se queda pegado en pending.

## Solución

### 1. `supabase/functions/refresh-cancellation-status/handler.ts`
Detectar la cancelación por cualquiera de estas señales que devuelve Facturapi y promoverla a `accepted`:

- `facturApiInv.status === "canceled"` (o `"cancelled"`, por si acaso)
- `facturApiInv.cancellation_status === "accepted"`
- `facturApiInv.cancellation?.status === "accepted"` (algunos payloads anidan el nodo)

Lógica nueva (mismo bloque, sin tocar el resto del handler):

```text
rawCancel = facturApiInv.cancellation_status
             ?? facturApiInv.cancellation?.status
rootStatus = facturApiInv.status  // "valid" | "canceled" | ...

if (rootStatus === "canceled" || rootStatus === "cancelled"
    || rawCancel === "accepted") {
  satStatus = "accepted"
} else if (rawCancel && VALID_SAT_STATUSES.includes(rawCancel)) {
  // no degradar terminal → pending
  if (!(TERMINAL_STATUSES.has(prior) && rawCancel === "pending"))
    satStatus = rawCancel
} else if (prior === "none") {
  satStatus = "pending"
}
```

Cuando `satStatus === "accepted"` se sigue disparando el mismo bloque que ya escribe `cfdi_status = 'cancelled'`, `status = 'cancelled'` y `cancelled_at`.

### 2. Corregir dato de FAC-0076 (una sola vez, vía insert)

Ya sabemos que Facturapi la reporta cancelada, así que además de arreglar el código dejamos el registro consistente:

```sql
UPDATE invoices
SET cancellation_status = 'accepted',
    cfdi_status = 'cancelled',
    status = 'cancelled',
    cancelled_at = now()
WHERE id = 'a18eadae-4847-48be-9395-b06ef6eec60f';
```

(Se hace con el tool de insert/update de datos, no como migración.)

### 3. Changelog `v6.104.5`
Entrada en `public/changelog.json` + `public/changelog/v6.104.5.json` describiendo:
- Bug: `refresh-cancellation-status` no reconocía `status: "canceled"` de Facturapi y dejaba la factura "esperando SAT" para siempre.
- Ahora se acepta cualquiera de las señales (`status` raíz o `cancellation_status`/`cancellation.status`) y se marca la factura como cancelada.
- Se sincronizó manualmente FAC-0076.

## Fuera de alcance
- No se toca la UI (`InvoiceDetailActions`); el badge ya reacciona correctamente en cuanto `cancellation_status = 'accepted'` y `status = 'cancelled'`.
- No se agrega polling automático: mantenemos el botón manual "Actualizar estado SAT" como hasta ahora.
- No se modifica `cancel-cfdi`.
