# Recibo técnico — activación 0105–0107 con control 0108

Fecha: 2026-10-19 (UTC). Proyecto: Lovable Cloud de LiftGo. Sin secretos.

## Antes de ejecutar
- Checkout: `210b91741` (descendiente de main `7d783fd0b4cd316132660ed3e1fcf0f9d65dfcb4`; diferencia sólo `public/version.json` y `types.ts` autogenerados).
- SQL 0105 1744 B `90eb081d…f663`, 0106 9873 B `b364165b…d2a1`, 0107 40557 B `b6ba356d…2de1`: exactos.
- No había otro 0108 en carpeta ni journal (journal 108 entradas, última 0107).
- Ledger: 106 filas, max id 107, max created_at 1792370295568 (0104), huella `9b7baf5f…a125`, 0 filas con id>107.
- Control transcrito: 34393 B, SHA256 `ce97a5bcebbcf5f5671861c4d74ed33b3c930710e9f99ded7441a7daf5ec89eb` (coincide).

## Ejecución
- Una sola llamada oficial `lov_database--migration`, name `control0108_verified_release`. Sin aprobación humana solicitada. Resultado: éxito.

## Después
- Archivo `drizzle/migrations/0108_control0108_verified_release.sql`: byte-idéntico al control (34393 B, `ce97a5bc…89eb`).
- Journal: idx 108 `0108_control0108_verified_release` when `1792440638110`, después de 0107 (`1792392861355`).
- Ledger: 110 filas; 106 históricas (id≤107) con huella `9b7baf5f…a125` intacta.
  - id 108 ts 1792391158311 hash 0105 ✓
  - id 109 ts 1792392861354 hash 0106 ✓
  - id 110 ts 1792392861355 hash 0107 ✓
  - id 111 ts 1792440638110 hash `ce97a5bc…89eb` (= archivo, = journal) ✓
- Las aserciones de 0108 (funciones, ACL, triggers, columnas, CHECK, índice, cotizaciones) corrieron dentro de la misma transacción y pasaron.
- Relectura independiente de ACL: funciones privadas sólo `postgres` y rol de plataforma; `get_quote_charge_availability`, `claim_payment_rep_stamping`, `create_recurring_invoice`, `e2e_seed_scenario` con authenticated/service_role, sin anon.

## No realizado
Sin despliegue de funciones ni frontend, sin cambios funcionales, permisos ni ledger manual. Cron/REP siguen en pausa a cargo del propietario.
