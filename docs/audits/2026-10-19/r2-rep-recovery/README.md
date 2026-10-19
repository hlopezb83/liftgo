# R2: recuperación segura de REP

Base auditada: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.
Todos los datos de las pruebas son sintéticos. No se usó navegador, Facturapi,
una cuenta publicada ni una base remota.

## Antes y después

El mismo corpus de 58 casos se ejecutó contra los cuatro archivos de producto
de la base y contra la corrección. La comparación se hizo en un worktree
exclusivo, restaurando los archivos corregidos al terminar el control anterior.

| Evidencia | Antes | Después |
| --- | --- | --- |
| Corpus Vitest completo | 24 fallos esperados, 34 PASS | 58 PASS |
| Casos nuevos | 45 casos (41 UI/handler y 4 de caché) | 45 PASS |
| Controles previos de permisos/cancelación/moneda | 13 PASS | 13 PASS |
| Error de configuración antes de enviar al PAC | Handler deja `pending`; UI no ofrece recuperación | `pending` sin identificadores permite corregir y reintentar |
| Respuesta perdida, JSON inválido, HTTP 5xx/408/409/425/429 | Se convierte en `error`, habilitando otro intento | Conserva `stamping` y su claim; registra motivo para conciliación |
| Petición directa para `stamping` con antigüedad de 6/60/1440 minutos | Llega al claim/PAC simulado | HTTP 409 antes del claim y del PAC |
| `none`/`pending`/`error` con ID PAC o UUID | La UI puede ofrecer emisión en algunos estados | No ofrece emisión; SQL propuesto tampoco reclama |
| Error de emisión con fila `none` en caché | Puede conservar una acción obsoleta | Espera el refetch antes de terminar la mutación |
| Refetch fallido o sin consulta del pago | Sin bloqueo adicional | Bloquea localmente otro intento y pide recargar, sin inventar un estado persistido |

Se preservan los permisos, el bloqueo por cancelación de la factura, la guarda
de operación en curso, el rechazo de REP timbrado y los identificadores estables
`external_id`/`idempotency_key`. `stamping` nunca se expone como reintento manual.
Un rechazo HTTP definitivo de validación/autorización (400/401/403/422, entre
otros 4xx inequívocos) continúa en `error` para permitir una corrección. Los
estados desconocidos permanecen sujetos a conciliación.

El contador de REP pendientes y la acción comparten la misma elegibilidad.
La caché se invalida por el namespace existente `paymentKeys.all`; no se cambian
los mecanismos de purga por usuario/organización ni se guardan credenciales.

## Propuesta SQL 0105, sin aplicar

`0105_rep_claim_reconciliation_only.sql` conserva firma, argumentos/default,
`SECURITY DEFINER`, autorización de roles/organización y canal interno existentes.
`CREATE OR REPLACE` conserva owner/ACL; no hay `GRANT`, `REVOKE` ni ampliación de
permisos. `p_stale_minutes` permanece por compatibilidad, pero no autoriza volver
a reclamar un REP `stamping`.

La transición atómica a `stamping` exige ambos identificadores nulos y estado
`none`, `pending`, `error` o `cancelled`. Se conserva el caso histórico de
`cancelled` sin identificadores; la UI sigue sin ofrecerlo. Toda fila `stamping`,
sin importar la edad ni un argumento negativo, queda para el reconciliador.
Éste mantiene su política existente de verificar ausencia en el PAC antes de
devolver una fila a `error`; no se modificó su algoritmo ni su selección.

Journal: idx 105, tag `0105_rep_claim_reconciliation_only`,
`when = 1792391158311`. El snapshot enlaza a `0104`; sólo registra metadatos de
una migración de función, sin cambios de tablas.

**Requiere revisión y aplicación coordinada por el padre. No fue ejecutada.**

## Validación y límites

- Vitest offline: 58/58 PASS. El handler real ejecuta autorización, alcance de
  organización, decisiones, composición y manejo de errores; sólo los puertos
  de configuración/SDK y los clientes de BD se inyectan como dobles. Esto no
  demuestra una transacción RLS ni una llamada real al PAC.
- `tsc --noEmit` y `tsc --noEmit -p tsconfig.browser-tests.json`: PASS.
- ESLint de los archivos modificados: PASS, sin advertencias.
- Deno fmt/lint de handler y pruebas: PASS.
- Journal de 106 migraciones: PASS, sin incidencias. `git diff --check`: PASS.
- Se agregaron cuatro casos Deno con el SDK real y transporte simulado para
  respuesta perdida/JSON inválido/500/409. Su ejecución local está bloqueada por
  dependencias ausentes en caché (`@sentry/deno@10.76.2` y Facturapi); no se
  descargaron ni instalaron paquetes. Deben pasar en el CI Deno existente.
- Se agregó `rep-claim-recovery-api.spec.ts` para el backend efímero A/B ya
  existente: login ordinario, claim RPC autenticado, antigüedad de 6/60/1440 min,
  IDs conocidos, carrera de dos llamadas, control de organización B y mecánico.
  Crea y borra sólo filas sintéticas por SDK ordinario; no usa service-role,
  SQL de prueba, bypass ni PAC. Pendiente de CI porque ASUS no tiene ese backend.
- No se declara validación GUI, RLS local ejecutada ni QA publicado.

Los resúmenes y hashes comparables están en `results.json`. Los logs locales
completos permanecen en `.tool-tmp`, fuera de los entregables públicos.

Comando del corpus Vitest (con TEMP/TMP/TMPDIR en `.tool-tmp`):

```text
node node_modules/vitest/vitest.mjs run src/features/invoices/hooks/invoices/__tests__/usePaymentHistoryColumns.repRecovery.test.tsx src/features/invoices/hooks/invoices/cfdi/__tests__/usePaymentComplement.recoveryCache.test.tsx src/features/invoices/hooks/invoices/cfdi/__tests__/usePaymentComplement.test.ts src/features/invoices/components/invoice-detail/__tests__/InvoicePaymentPermissions.test.tsx --maxWorkers=1
```
