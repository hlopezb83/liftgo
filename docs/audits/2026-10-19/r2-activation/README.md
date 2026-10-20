# Propuesta de activación R2

Estado: **`PROPOSED_NOT_EXECUTED`**. Release R2 integrado fijado:
`cebe9a94d023dc1714fa5e0585a43902e05c3a2b` (orden de integración
282 → 285 → 286 → 283 → 284).
Esta entrega contiene únicamente documentación. **La activación está bloqueada
por diferencias históricas del ledger**, detectadas en el preflight coordinado
de sólo lectura resumido abajo. No acredita el vínculo vivo frontend/Edge,
el canal de publicación ni una autorización para ejecutar el plan. La tarea
documental no conectó al backend, aplicó SQL, desplegó, fusionó ni probó cuentas.

El [contrato de migraciones](../../../migration-release-contract.md) rige esta
propuesta. `manifest.json` fija las fuentes revisadas, el journal completo y los
hashes esperados; sus placeholders deben resolverse privadamente por el padre.

## Procedencia integrada y dependencias

| PR | Head revisado → commit integrado | Situación al actualizar esta propuesta |
| --- | --- | --- |
| 282 | `46e5880eac4f9f992d68e14108c1a20cf7abf426` → `4de7d314c140ccccb326730430bd8e6eb96219c8` | Integrado; validaciones de release postmerge verdes; publicación no verificada |
| 285 | `45b452431dda30d5138e01ac73490366b184bda9` → `3d679f30da4ffdf861a2ac185c435128fe3d1809` | Integrado; validaciones de release postmerge verdes; publicación no verificada |
| 286 | `8f4103f266a2e3e57375776fee6f2c063650d47c` → `0a532d68f0458b96b6e5a8e9f32900322056775f` | Integrado; validaciones de release postmerge verdes; publicación no verificada |
| 283 | `d628dd0c24db765c82ffb2197c56df9b214dc1f0` → `a72ecf2a485fceb3bd5aca12310b3d3d22b51efd` | Reconciliado e integrado; validaciones de release postmerge verdes; publicación no verificada |
| 284 | `069a732787e2c61c956172ae8f4c08ecf0956256` → `cebe9a94d023dc1714fa5e0585a43902e05c3a2b` | Reconciliado e integrado; validaciones de release postmerge verdes; depende de 285; publicación no verificada |

El orden obligatorio **285 → 284**, con SQL **0105 → 0106**, está conservado en
la integración. Los SHA revisados y de merge tienen procedencia separada; los
hashes del manifest se recalculan contra los blobs exactos del release final,
sin asumir ancestría literal de los heads tras un squash. El release fijado
no es una autorización de activación.

Las validaciones del [CI del release final](https://github.com/hlopezb83/liftgo/actions/runs/39247742708),
[RLS DB](https://github.com/hlopezb83/liftgo/actions/runs/39247742573),
[Gate A/B](https://github.com/hlopezb83/liftgo/actions/runs/39247742387) y
[detección de secretos](https://github.com/hlopezb83/liftgo/actions/runs/39247742254)
terminaron correctamente. Actionlint y dependency-review figuran como omitidos
por sus condiciones de ejecución; no se contabilizan como pruebas ejecutadas.
Las comprobaciones automáticas independientes de Dependabot no certifican la
activación ni cambian los límites de estas evidencias.

## Ejecutables que se activan

- **Frontend**: moneda/FX de extensiones (282); edición SAT y fecha parcial
  inválida (283, inventario final reconciliado); elegibilidad REP,
  resumen y refetch/bloqueo de caché (285); moneda/origen cliente-factura y
  presentación de depreciación (286). El manifest enumera cada archivo runtime
  desde los diffs de los merges, con hashes del release final; omite
  tests/documentación de ese inventario.
- **Edge modificado**: `stamp-payment-complement`, cuyo `index.ts` existente
  carga el `handler.ts` corregido por 285. Publicar sólo frontend no activa esa
  defensa. El artefacto Edge debe proceder del mismo release revisado.
- **Edge sin cambio de código en este lote**: `stamp-cfdi` y
  `reconcile-stamping-invoices`. 284 añade pruebas de claim, pero su corrección
  runtime es SQL; no implica desplegar un handler nuevo de `stamp-cfdi`. La
  identidad y salud de los Edge existentes deben verificarse por el canal
  autorizado; aquí no se certifican sus versiones publicadas.

No se incluye el nuevo arreglo/modelo de consumo de extras de logística ni su
migración 0107. El release fijado termina en 0106. Si se cambia de checkout y
aparece 0107 o más DDL, el migrador podría seleccionarlo: detener y revisar de
nuevo todo el lote; este manifest no autoriza ese contenido adicional.

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
Los 107 hashes/tamaños, el journal, los snapshots 0105/0106 y los archivos runtime
se contrastaron con los bytes exactos de los blobs del release final. Los dos SQL nuevos
son LF. El runner debe producir los mismos bytes y hashes; Drizzle no normaliza
CRLF al calcular su hash. No convertir contenido ni reparar el ledger para
hacerlo coincidir.

## Preflight coordinado observado: activación bloqueada

Lectura coordinada del 19 de octubre de 2026, 12:12–12:13 UTC, comparada con el
release fijado. Se conservan las filas y los detalles del destino fuera de esta
evidencia pública; aquí sólo se registra el resultado agregado y su procedencia:

- 106 filas aplicadas; están presentes los 105 timestamps del prefijo 0000–0104.
  95 hashes coinciden exactamente y diez difieren. Hay una fila histórica extra,
  sin duplicados de timestamp o timestamp/hash ni huecos de timestamp del prefijo.
- Cuatro diferencias se explican por bytes de saltos de línea: 0046, 0051 y 0052
  coinciden con el hash aplicado al quitar exactamente el último CRLF vacío
  (dos bytes); 0077 coincide al convertir LF a CRLF. Son comparaciones locales
  diagnósticas, no permiso para normalizar archivos o hashes.
- 0004, 0005, 0006, 0007 y 0010 ya tienen
  [antecedente documentado](../../../multiempresa/tramo-8-1-rollout-folio-rep.md).
  La comparación funcional limitada de ese antecedente es histórica y no fue
  revalidada en este preflight. Los bytes aplicados de 0074 no se recuperaron
  de Git ni de las variantes de formato probadas. Una lectura dirigida posterior
  (12:17–12:19 UTC) sí verificó sus cinco funciones y su trigger contra las
  definiciones revisadas: cuatro cuerpos coinciden exactamente con 0074 y
  `complete_return_inspection` coincide con su revisión posterior en 0081.
  Firmas, modos de seguridad y demás propiedades comprobadas conforman; no se
  encontró divergencia actual sin explicar. Esto no reconstruye el archivo
  original aplicado ni convierte su diferencia de checksum en sólo formato.
- La fila extra está identificada como la migración histórica
  `0030_portal_fallback_respects_account_status`: los bytes y el timestamp del
  [commit que la añadió](https://github.com/hlopezb83/liftgo/commit/148912e2e9ab60947f1c5e3eee798b37a70df9be)
  coinciden; [otro commit retiró su entrada del journal](https://github.com/hlopezb83/liftgo/commit/841bcb894d6c158cf9d9f8cdbb4c1dfc9ecbf034).
  Identificarla no la convierte en parte del prefijo actual aprobado.
- 0104 coincide con el SQL oficial del release y con el hash de este manifest.
  El hash de una propuesta histórica fue sustituido por ese SQL oficial; véase
  la [integración de 0104](../../2026-10-18/supplier-discount-integrated/README.md).
- La regla de timestamps de Drizzle seleccionaría 0105 y 0106. Esto **no**
  demuestra que el prefijo sea compatible ni habilita la ejecución del lote.
  El catálogo observado conserva el reclaim REP por antigüedad anterior a 0105;
  faltan las tres funciones y los tres triggers de 0106.

El gate de prefijo exacto queda **`BLOCKED_LEDGER_DRIFT`**. Detener la activación
hasta resolver por revisión la procedencia y compatibilidad de las diferencias,
renovar el plan y repetir las lecturas. No aplicar 0105/0106, normalizar hashes,
reescribir migraciones históricas, reparar el ledger ni modificar filas de
negocio como atajo. La ausencia de huecos, la explicación parcial y el CI verde
no cierran este gate. El runner productivo, la inyección oficial de secretos,
la exclusión de ejecutores, los canales y el drenaje REP siguen sin acreditar.

## Precondiciones y preflight, sólo propuestos

1. Padre identifica `<APPROVED_TARGET>`, canal oficial, aprobación específica
   de SQL/publicación, identidad de runner y control de exclusión. No usar IDs,
   ledger ni credenciales de capturas anteriores. Resolver esos datos en privado;
   no incluir URLs, tokens, cuentas reales, backend IDs ni ACL/ledger crudos en
   evidencia pública.
   La referencia configurada en `supabase/config.toml` fue contrastada con la
   esperada por el coordinador en el release fijado. Esto acredita configuración
   fuente, no el vínculo vivo de frontend/Edge con ese backend. La lectura
   coordinada del ledger detectó el bloqueo anterior; no es un preflight aprobado.
   El runner productivo, los canales de publicación y la ventana operativa
   siguen sin resolver; no se infieren de CI ni del proyecto configurado.
2. Un solo ejecutor debe cubrir preflight, migración y comprobación posterior.
   `max:1` del cliente y la concurrencia CI por ref no son exclusión productiva.
   Coordinar una ventana que impida nuevas emisiones REP y **drene todas las
   solicitudes en vuelo del handler antiguo** antes del cambio. Acreditar por el
   canal operativo autorizado que no quedan ejecuciones antiguas capaces de
   escribir, y mantener la ventana hasta verificar SQL y Edge. Bloquear sólo
   solicitudes nuevas o desplegar el handler corregido no demuestra el drenaje.
   Una ejecución antigua puede terminar después del SQL, convertir una respuesta
   PAC incierta en `error` y permitir otro claim aun con 0105; no reabrir mientras
   exista esa posibilidad o el drenaje sea desconocido. No crear
   flags, ampliar permisos ni cambiar cuentas/credenciales para conseguirlo.
3. Checkout del SHA final fijado; preservar CI/build/revisión de ese árbol; bytes y hashes de
   **todo** el journal iguales al manifest. Confirmar versiones del runner y
   resolución de driver descritas en el contrato, con dependencias provisionadas
   por su canal autorizado. No instalar herramientas desde ASUS para salvar un
   bloqueo ni usar una ruta alternativa a una acción denegada.
4. Con el canal oficial, repetir la comprobación del destino y la lectura del
   ledger existente. Las siguientes plantillas no fueron ejecutadas por esta
   tarea documental; la observación coordinada anterior no habilita el lote:

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

1. Usar el release integrado fijado y sus heads revisados; generar artefactos
   de ese mismo SHA por el canal autorizado y verificar de nuevo este manifest.
   Los merges y CI indicados están completos; la generación/activación de
   artefactos productivos no se ha verificado.
2. Resolver por revisión nueva el bloqueo histórico del ledger y repetir el
   preflight; completar exclusión, destino y aprobación. Bloquear nuevas emisiones
   REP y acreditar el drenaje de todas las solicitudes del handler antiguo.
   Si no se puede demostrar ese drenaje, detener sin aplicar ni reabrir.
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
   inventa uno. Mantener la ventana hasta verificar versiones, salud y que no
   quede ninguna ejecución antigua capaz de escribir tras el cambio.
6. Ejecutar QA coordinado y autorizado, registrar evidencias y liberar la ventana
   sólo cuando el padre confirme SQL/Edge, el drenaje antiguo y el resultado.

## QA posterior y límites

El manifest deja todos los checks en `NOT_EXECUTED`. El único operador GUI
coordinado deberá usar sólo fixtures sintéticas y el destino aprobado; las
operaciones de escritura requieren su autorización concreta. No se pide crear
pagos, cancelar reservas, cambiar roles o alterar configuración/credenciales de
cuentas reales, ni generar llamadas a un PAC real.

- Extensión: USD/17.5 conserva moneda, TC y tarifa; MXN usa 1 y FX extranjero
  inválido bloquea en vez de asumir 1.
- Pago/fecha (head 283 reconciliado fijado): transferencia→efectivo permite SAT coherente;
  notas conservan override 28/29; REP timbrado no cambia campos fiscales; una
  fecha parcial/inválida no envía la válida anterior; fecha de emisión mantiene
  captura por teclado compatible.
- REP: roles/PPD/cancelación conservados; `pending` sin IDs ofrece recuperación;
  `stamping`, UUID o ID PAC bloquean reemisión; fallo de refetch exige **recargar
  la página**. Las pruebas controladas de respuesta perdida permanecen offline,
  sin provocar incertidumbre ni alterar credenciales en el entorno publicado.
- Transición REP: evidencia operativa de cero solicitudes antiguas en vuelo
  antes del cambio y de la reapertura, más versión corregida verificada.
  Un simple bloqueo de nuevas solicitudes no satisface este control.
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
La misma precaución aplica al primer despliegue: el drenaje de ejecuciones
antiguas es una puerta obligatoria y separada de instalar la versión corregida.

Todo cambio de head, SQL/journal, destino, canal o lote pendiente invalida la
propuesta hasta actualizarla y revisarla. La publicación y las verificaciones
remotas quedan exclusivamente bajo coordinación del padre.
