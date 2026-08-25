# fix-07.diff — Validación y plan de implementación

Revisé el estado real del proyecto contra los 5 hallazgos del archivo. Los cuatro son bugs reales; uno (M-10) necesita una pieza extra para servir de algo.

## Qué encontré

| Fix | ¿Bug real? | Estado verificado hoy |
|-----|-----------|------------------------|
| M-10 rate_type explícito | Sí, parcial | `rentalRateField` en `useQuotePrefill.ts` solo adivina por texto y por la heurística "unit == total y ≥28 días". La palabra `rate_type` no existe en ningún lado del repo: ni se guarda en las partidas ni se lee. El parche solo agrega el lector. |
| M-15 tolerancia de sobrepago | Sí | `enforce_payment_within_invoice_total`, `register_supplier_payment` y `sync_invoice_status_from_payments` usan hoy 0.01 como colchón, lo que permite aceptar un centavo de sobrepago real. |
| M-16a detalle de Facturapi | Sí | `download-cfdi/index.ts:175` devuelve `detail` de Facturapi al navegador. |
| M-16b errores crudos | Sí | `classify-feedback-report`, `invite-customer` e `invite-user` devuelven el mensaje crudo de base de datos/Auth al cliente. |
| H-11 aislamiento E2E | Sí | Las policies SELECT de `customers`, `quotes` y `forklifts` no filtran `is_e2e`; hoy el filtro vive solo en el cliente. |

## Cambios propuestos

**M-10 — Tipo de tarifa explícito (sin tocar el pasado)**
- Guardar `rate_type` ("daily" / "weekly" / "monthly") en cada partida de renta al crear o editar cotizaciones, para que deje de ser adivinanza.
- Al leer una cotización, si la partida trae `rate_type`, ése manda; si no (cotizaciones históricas), se conserva la heurística actual como respaldo. Sin migración de datos ni cambios retroactivos.

**M-15 — Sobrepagos**
- El colchón de medio centavo se usará **solo** para marcar una factura o una factura de proveedor como "pagada" (redondeos bancarios).
- Cualquier pago que deje el pagado por encima del saldo facturable se rechaza sin colchón, tanto en facturas de cliente como en cuentas por pagar.

**M-16a / M-16b — Mensajes de error**
- Las funciones de servidor dejan de mandar al navegador el detalle interno de Facturapi, de la base de datos y de Auth; queda solo en el log del servidor y el usuario ve un mensaje genérico.
- En `invite-user` se conserva el status 409 cuando el correo ya existe, para que la interfaz siga distinguiendo ese caso.

**H-11 — Aislar datos de pruebas del lado del servidor**
- Las policies de lectura de `customers`, `quotes` y `forklifts` para dispatcher, mecánico, ventas y auditor excluirán filas marcadas como de prueba (`is_e2e`), aunque el cliente olvide filtrarlas.

### Punto que necesita tu criterio
Si las pruebas end-to-end corren con usuarios de rol dispatcher/mecánico/ventas/auditor, dejarían de ver sus propios datos de prueba y esas suites fallarían. Propongo aplicar el filtro solo a esos cuatro roles y dejar admin/administrativo sin filtrar (que es donde suelen correr los E2E). Si prefieres, lo aplicamos a todos los roles no admin y ajustamos las suites.

## Detalles técnicos

- `src/features/quotes/hooks/quoteForm/useQuotePrefill.ts`: nuevo `explicitRateField()` y firma de `rentalRateField` con `rate_type`; `quoteFormBuilders.ts` / `quoteFormPayload.ts` persisten `rate_type` en las partidas.
- Migración M-15: `CREATE OR REPLACE` de `sync_invoice_status_from_payments`, `enforce_payment_within_invoice_total`, `register_supplier_payment` y `recalc_supplier_bill` (0.005 solo al marcar pagado; rechazo estricto en inserción).
- Migración H-11: recreación de policies SELECT con `AND (is_e2e IS NOT TRUE)`. El diff usa `auth.uid()` directo; lo escribiré como `(select auth.uid())` según tus reglas permanentes de migraciones, con `SET search_path` y guards ya presentes, y pasando `scripts/lint-migrations.ts`.
- Edge functions: `download-cfdi`, `classify-feedback-report`, `invite-customer`, `invite-user`.
- Tests: cobertura nueva para `rentalRateField` con `rate_type` y para el rechazo de sobrepago; correr la suite completa y el build.
- Changelog: nueva entrada minor (v7.341.0) en `public/changelog.json` y el MD de changelog.
