

## Fix datos FAC-0035 — Sincronizar `paid_at`

### Problema
El pago de FAC-0035 fue editado antes de que se implementara la sincronización automática (v5.17.2). Por eso `paid_at` quedó desactualizado (2026-03-26) mientras que el pago dice 2026-04-08.

### Solución
Actualizar `paid_at` de la factura para que coincida con la fecha del pago registrado.

```sql
UPDATE invoices SET paid_at = '2026-04-08' WHERE id = '7a6ed64f-950b-4332-a5c8-e160d8d4b3ef';
```

Un solo cambio de datos, sin modificaciones de código. A partir de ahora, cualquier edición futura de pagos sincronizará automáticamente gracias a v5.17.2.

