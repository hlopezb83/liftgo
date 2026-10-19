# Propuesta de activación R2

Estado: **`PROPOSED_NOT_EXECUTED`**. Base documental local:
`4de7d314c140ccccb326730430bd8e6eb96219c8` (PR 282 ya integrado).
Esta entrega contiene únicamente documentación. No certifica el backend, el
ledger, el canal de publicación ni una autorización para ejecutar el plan.
No se conectó a ningún destino ni se aplicó, desplegó, fusionó o probó una cuenta.

El [contrato de migraciones](../../../migration-release-contract.md) rige esta
propuesta. `manifest.json` fija las fuentes revisadas, el journal completo y los
hashes esperados; sus placeholders deben resolverse privadamente por el padre.

## Candidatos y dependencias

| PR | Fuente local fijada | Situación al preparar esta propuesta |
| --- | --- | --- |
| 282 | merge `4de7d314c140ccccb326730430bd8e6eb96219c8` | Integrado; publicación no verificada aquí |
| 283 | último head conocido `991347f1e871791c5f9243cbaf89e81f14e12b3f` | En reconciliación; **head final, revisión y CI pendientes** |
| 285 | `45b452431dda30d5138e01ac73490366b184bda9` | Revisado/CI aprobado según coordinación; merge/publicación pendientes |
| 284 | `988803bcb7247674ad0c1ca2f5c28eb084f34105` | Revisado/CI aprobado según coordinación; depende de 285 |
| 286 | `8f4103f266a2e3e57375776fee6f2c063650d47c` | Revisado/CI aprobado según coordinación; merge/publicación pendientes |

El orden obligatorio es **285 → 284**, con SQL **0105 → 0106**. El padre
coordina los merges. El head conocido de 283 no es una autorización de activación.
Antes de ejecutar se debe fijar `<FINAL_INTEGRATED_RELEASE_SHA>`, incorporando
su corrección reconciliada, revisión y CI del árbol final. Un squash/merge puede
cambiar los SHA: registrar su procedencia y verificar contenido, no asumir
ancestría literal de los heads de revisión.

## Ejecutables que se activan

- **Frontend**: moneda/FX de extensiones (282); edición SAT y fecha parcial
  inválida (283, inventario provisional hasta su head final); elegibilidad REP,
  resumen y refetch/bloqueo de caché (285); moneda/origen cliente-factura y
  presentación de depreciación (286). El manifest enumera cada archivo runtime
  desde los diffs locales; omite tests/documentación de ese inventario.
- **Edge modificado**: `stamp-payment-complement`, cuyo `index.ts` existente
  carga el `handler.ts` corregido por 285. Publicar sólo frontend no activa esa
  defensa. El artefacto Edge debe proceder del mismo release revisado.
- **Edge sin cambio de código en este lote**: `stamp-cfdi` y
  `reconcile-stamping-invoices`. 284 añade pruebas de claim, pero su corrección
  runtime es SQL; no implica desplegar un handler nuevo de `stamp-cfdi`. La
  identidad y salud de los Edge existentes deben verificarse por el canal
  autorizado; aquí no se certifican sus versiones publicadas.

No se incluye ningún arreglo/modelo de consumo de extras de logística ni una
eventual migración 0107. Si el checkout final contiene más DDL, el migrador podría
seleccionarlo: detener y revisar de nuevo todo el lote antes de ejecutar.

## SQL y metadatos exactos

| idx/tag | when | SHA-256 del SQL UTF-8 LF |
| --- | ---: | --- |
| 105 / `0105_rep_claim_reconciliation_only` | 1792391158311 | `90eb081d9547456abef06f8ca74d46130367f437f472dc35836e43af9df8f663` |
| 106 / `0106_booking_invoice_cancellation_guards` | 1792392861354 | `b364165b0d27f207b7a2b99ecfe1fa00ceab70ba4277ff1b3d155a3fd4d0d2a1` |

Snapshot 0105: id `d9eee720-9ea3-4f40-bcf5-596198189b41`, prevId
`8f2d4bd9-4569-4f8e-9bb0-f9797c949616`. Snapshot 0106: id
`b4e20fc3-4672-41c4-b8cb-ebfe6246743b`, prevId igual al id de 0105.
Versión de journal/snapshots: `7`; breakpoints `true`.

0105 conserva firma, default, organización y ACL existentes del claim y elimina
el reclaim de `stamping` por edad. 0106 añade tres funciones/trigger privados
para cancelación/activación/vínculo, sin dar SELECT de facturas al dispatcher y
sin cambiar `cancel_booking` de INVOKER. Sus REVOKE afectan sólo a las tres
funciones nuevas; no hay GRANT ni reparación de filas de negocio. Los owner/ACL
reales deben contrastarse por lectura fresca, no se dan por conocidos.

El manifest contiene las **107 entradas 0000–0106**, no sólo las dos nuevas.
Sus hashes son de los bytes exactos de los blobs Git fuente. Los dos SQL nuevos
son LF. El runner debe producir los mismos bytes y hashes; Drizzle no normaliza
CRLF al calcular su hash. No convertir contenido ni reparar el ledger para
hacerlo coincidir.

## Precondiciones y preflight, sólo propuestos

1. Padre identifica `<APPROVED_TARGET>`, canal oficial, aprobación específica
   de SQL/publicación, identidad de runner y control de exclusión. No usar IDs,
   ledger ni credenciales de capturas anteriores. Resolver esos datos en privado;
   no incluir URLs, tokens, cuentas reales, backend IDs ni ACL/ledger crudos en
   evidencia pública.
2. Un solo ejecutor debe cubrir preflight, migración y comprobación posterior.
   `max:1` del cliente y la concurrencia CI por ref no son exclusión productiva.
   Coordinar una ventana sin nuevas emisiones REP durante el cambio hasta que
   SQL y Edge estén verificados, usando un control operativo aprobado. No crear
   flags, ampliar permisos ni cambiar cuentas/credenciales para conseguirlo.
3. Checkout del SHA final; CI/build/revisión de ese árbol; bytes y hashes de
   **todo** el journal iguales al manifest. Confirmar versiones del runner y
   resolución de driver descritas en el contrato, con dependencias provisionadas
   por su canal autorizado. No instalar herramientas desde ASUS para salvar un
   bloqueo ni usar una ruta alternativa a una acción denegada.
4. Con el canal oficial, comprobar identidad del destino y leer sólo el ledger
   existente. Las consultas siguientes son plantillas **no ejecutadas**:

```sql
SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ledger_exists;

-- Sólo si ledger_exists es true:
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at, id;
```

Comparar cada hash/`created_at` con `sha256`/`when` del manifest completo. Rechazar
duplicados, huecos del prefijo, registros desconocidos o contenido distinto.
No inferir huecos a partir de saltos del serial `id`. Si falta el ledger de una
base ya poblada, detener; no tratarla como instalación limpia.

Con prefijo exacto hasta 0104, el lote esperado es [0105,0106]; hasta 0105, sólo
[0106]; si ambas están aplicadas y coinciden, no reejecutar SQL. Cualquier otro
caso exige resolver discrepancias y renovar la revisión. Drizzle selecciona por
`when`, no verifica hashes y aplica **todo** lo pendiente en una transacción.

Antes/después, el canal privado debe leer también definiciones, owner/ACL,
`prosecdef`, `provolatile`, `proconfig` y triggers afectados, y comparar contratos.
Las consultas de catálogo están en el manifest; son SELECT, no prueban por sí
solas comportamiento ni sustituyen las pruebas autenticadas de CI.

## Orden de activación propuesto

1. Cerrar heads/revisiones pendientes y merges coordinados (285 antes de 284),
   fijar SHA integrado, generar artefactos y verificar de nuevo este manifest.
2. Completar preflight/exclusión/ventana de escritura, destino y aprobación.
3. En el **runner remoto oficial ya autorizado**, con secreto inyectado sólo
   como `LOVABLE_DB_MIGRATION_URL`, usar el carril existente del contrato. Estos
   comandos se documentan como propuesta; no se ejecutaron desde esta tarea:

```text
bun install --frozen-lockfile
bun run migrations:check
bunx drizzle-kit migrate --config=drizzle.config.ts
```

No hay un comando para aplicar sólo 0105/0106 fuera del journal. Si falta una
dependencia del runner, detener y coordinar su provisión; no permitir que `bunx`
resuelva otra versión de la CLI. No insertar, borrar ni reparar filas del ledger.

4. Hacer SELECT nuevo del ledger y de los objetos. Verificar sólo las entradas
   esperadas, hashes exactos, claim sin reclaim de `stamping`, cancelación
   INVOKER intacta, triggers habilitados y ACL sin ampliaciones. Un resultado
   incierto de commit exige lectura fresca antes de considerar un reintento.
5. Sólo después, activar `stamp-payment-complement` por
   `<APPROVED_EDGE_DEPLOYMENT_CHANNEL>` y frontend por
   `<APPROVED_FRONTEND_DEPLOYMENT_CHANNEL>`, ambos del SHA integrado. Este repo
   no acredita aquí esos canales ni un comando de publicación oficial; no se
   inventa uno. Mantener la ventana hasta verificar versiones y salud.
6. Ejecutar QA coordinado y autorizado, registrar evidencias y liberar la ventana
   sólo cuando el padre confirme el resultado.

## QA posterior y límites

El manifest deja todos los checks en `NOT_EXECUTED`. El único operador GUI
coordinado deberá usar sólo fixtures sintéticas y el destino aprobado; las
operaciones de escritura requieren su autorización concreta. No se pide crear
pagos, cancelar reservas, cambiar roles o alterar configuración/credenciales de
cuentas reales, ni generar llamadas a un PAC real.

- Extensión: USD/17.5 conserva moneda, TC y tarifa; MXN usa 1 y FX extranjero
  inválido bloquea en vez de asumir 1.
- Pago/fecha (con head 283 final): transferencia→efectivo permite SAT coherente;
  notas conservan override 28/29; REP timbrado no cambia campos fiscales; una
  fecha parcial/inválida no envía la válida anterior; fecha de emisión mantiene
  captura por teclado compatible.
- REP: roles/PPD/cancelación conservados; `pending` sin IDs ofrece recuperación;
  `stamping`, UUID o ID PAC bloquean reemisión; fallo de refetch exige **recargar
  la página**. Las pruebas controladas de respuesta perdida permanecen offline,
  sin provocar incertidumbre ni alterar credenciales en el entorno publicado.
- Dispatcher: factura vigente directa/pivote impide cancelar aun oculta por RLS;
  draft pendiente/error libre, fiscal `stamping` ocupado, cancelación aceptada
  libera lo autorizado. No habilitar SELECT de facturas al dispatcher. Verificar
  las carreras sólo mediante el arnés aislado existente, sin fabricar metadatos
  fiscales desde una cuenta publicada.
- Clientes/reportes: moneda explícita; cliente→factura→Volver conserva lista y
  origen; depreciación visible/CSV suma al centavo, sin cambiar la utilidad.

CI y RPC prueban preservación/no reintento y los límites autenticados revisados.
**No se ha demostrado la cadena integral respuesta PAC perdida → reconciliador
→ UUID persistido como stamped.** El reconciliador mantiene handler privado y no
se modificó para esta entrega. No se presenta ese E2E ni un cron/PAC publicado
como verificado. Tampoco se garantiza inmovilidad de todo campo/vínculo de un
borrador durante PAC; el límite de 284 es cancelación/reserva frente al claim.

## Contención y rollback

Si falla el lote antes del commit, el camino inspeccionado revierte todo lo
pendiente; el bootstrap del ledger ocurre fuera del lote y puede permanecer.
Comprobar estado con SELECT fresco bajo exclusión; no ejecutar un down ni
reparar ledger/filas manualmente.

No hay down automático autorizado para 0105/0106: restaurar el reclaim antiguo
o quitar los triggers reabre los fallos. Preferir corrección hacia delante con
revisión nueva. El frontend podría volver a un artefacto previo compatible como
contención aprobada, conservando SQL/Edge y aceptando que reaparezcan fallos UI.

**No hacer rollback ciego del Edge REP al handler antiguo**: convertir una
respuesta incierta en `error` permitiría otro claim incluso con 0105. No se ha
validado un rollback Edge seguro con emisiones activas. Si es necesario retirar
un artefacto Edge, el padre debe aprobar una contención compatible y su prueba;
esta propuesta no cambia permisos, credenciales ni datos para lograrla.

Todo cambio de head, SQL/journal, destino, canal o lote pendiente invalida la
propuesta hasta actualizarla y revisarla. La publicación y las verificaciones
remotas quedan exclusivamente bajo coordinación del padre.
