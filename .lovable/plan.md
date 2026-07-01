## Problema

Facturapi rechaza el timbrado de Factura Global con:
```
"global.periodicity" must be one of [day, week, fortnight, month, two_months]
```

Guardamos la periodicidad como código SAT (`"01".."05"`) en `invoices.global_periodicity`, pero el SDK de Facturapi espera el string enum `day|week|fortnight|month|two_months`. En `stamp-cfdi/handler.ts` estamos mandando el código SAT tal cual.

## Cambio

1. En `supabase/functions/stamp-cfdi/handler.ts`, agregar un mapeo antes de construir `payload.global`:
   ```
   01 → day
   02 → week
   03 → fortnight
   04 → month
   05 → two_months
   ```
   Si el valor ya viene como uno de los enums de Facturapi, dejarlo pasar (compatibilidad). Si no matchea, lanzar error claro antes de llamar a Facturapi.
2. Dejar `months` y `year` igual (Facturapi acepta el código SAT de meses `"01".."18"` como string).
3. Agregar entrada patch al changelog: `v6.104.3` — "Fix Factura Global: mapear código SAT de periodicidad al enum que espera Facturapi".

Sin cambios de UI ni de base de datos (seguimos guardando el código SAT, que es lo correcto desde la perspectiva del formulario y del CFDI).
