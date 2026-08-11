# Paquete R4 — validación y plan de corrección

Los 4 hallazgos del paquete son bugs reales. Verifiqué cada uno contra la base de datos y el código actual.

## Qué está roto hoy

1. **FIX-R4-01 (alta) — Desasignar un equipo vendido siempre falla.**
   Confirmado en la base: la función `validate_transition` no permite ninguna salida del estado `sold`, y no reconoce la bandera `app.forklift_rpc` que sí activa la función `unassign_forklift_from_sale_quote` antes de regresar la unidad a `available`. Analogía: la RPC trae el gafete correcto, pero el guardia de la puerta no tiene ese gafete en su lista, así que la rechaza siempre.

2. **FIX-R4-02 (alta) — El badge "XML por recuperar" nunca se apaga.**
   Confirmado: en `download-cfdi`, la consulta de facturas no pide la columna `cfdi_xml_pending`, pero más abajo el código la usa para decidir si limpia la bandera (líneas 408 y 415). Al no venir en la consulta, siempre es "indefinida" y nunca limpia.

3. **FIX-R4-03 (baja) — Deuda técnica en `useUnassignForklift`.**
   Confirmado: los tipos generados ya incluyen la RPC, así que el cast manual y su comentario sobran.

4. **FIX-R4-04 (baja) — Fallos silenciosos al guardar archivos.**
   Confirmado: en las ramas de nota de crédito y REP se descarta el resultado de `persistDownload`; si falla el guardado no queda rastro en logs.

## Ajuste importante respecto al documento

El SQL propuesto en el paquete incluye una lista blanca para `deliveries` y un estado inicial extra que **la función vigente en la base no tiene**. Aplicarlo tal cual cambiaría reglas de negocio no solicitadas. La migración se escribirá copiando el cuerpo **real vigente** y agregando únicamente el bypass acotado a montacargas.

## Plan

1. **Migración nueva** que reemplaza `validate_transition` preservando su lógica actual exacta y agregando, justo antes del error final:
   permitir la transición cuando la tabla es `forklifts` y la bandera transaccional `app.forklift_rpc` está activa. El bypass solo puede activarse dentro de funciones con verificación de rol previa, no desde el cliente.
2. **Prueba SQL** en `supabase/tests/r4_smoke.sql`: control negativo (sin bandera, `sold → available` sigue bloqueado) y camino feliz (con bandera, pasa). Todo dentro de una transacción con `ROLLBACK`.
3. **`download-cfdi`**: agregar `cfdi_xml_pending` al `.select()` de la rama de facturas, sin tocar las guardas existentes.
4. **`download-cfdi`**: capturar el booleano de `persistDownload` en las ramas de nota de crédito y REP y registrar `console.error` con el mismo patrón de la rama de facturas. El archivo se sigue entregando al usuario.
5. **`useUnassignForklift.ts`**: eliminar el tipo local, el cast y el comentario obsoleto; llamar `supabase.rpc` tipado.
6. **Verificación**: typecheck, ESLint, `deno fmt --check`, suite de pruebas y despliegue de la edge function.
7. **Changelog**: nueva entrada `v7.288.0` en `public/changelog.json` y `public/changelog/v7.288.0.json`, con versión alineada en `package.json`.

## Detalles técnicos

- Migración: `supabase/migrations/<timestamp>_fix_r4_01_validate_transition_forklift_rpc_bypass.sql`, con `CREATE OR REPLACE FUNCTION public.validate_transition()`, `SET search_path = public`. Sin cambios en triggers.
- Edge: `supabase/functions/download-cfdi/index.ts` (select de facturas, ramas `credit_notes` y REP).
- Frontend: `src/features/fleet/hooks/forklifts/assignForklifts/useUnassignForklift.ts`.
