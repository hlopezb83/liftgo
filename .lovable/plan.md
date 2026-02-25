
# Fix: CORS para entorno de preview

## Problema detectado
El boton "Generar Recurrentes" funciona correctamente a nivel backend -- la edge function responde con `{"success": true, "invoicesCreated": 0}` (no hay reservas recurrentes pendientes, lo cual es correcto).

Sin embargo, en el entorno de preview del navegador, la llamada falla con `net::ERR_FAILED` porque el archivo `cors.ts` solo permite origenes `*.lovable.app`, pero el preview usa dominios `*.lovableproject.com`.

## Solucion

### Archivo: `supabase/functions/_shared/cors.ts`
Agregar una segunda regex para permitir origenes `*.lovableproject.com` en la funcion `isAllowedOrigin`:

```typescript
if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
```

Esto permite que tanto el preview (`*.lovableproject.com`) como produccion (`*.lovable.app`) funcionen correctamente.

## Resultado esperado
- El boton "Generar Recurrentes" funcionara en preview y en produccion
- Mostrara el toast "Sin facturas pendientes" cuando no haya reservas recurrentes por facturar
- Cuando existan reservas con facturacion recurrente habilitada y 30+ dias sin facturar, generara los borradores automaticamente

## Verificacion
La edge function ya fue probada directamente y responde correctamente. Solo falta corregir el CORS para que el navegador pueda completar la solicitud.
