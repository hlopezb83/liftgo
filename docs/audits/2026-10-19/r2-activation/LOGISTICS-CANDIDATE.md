# Apéndice candidato: logística 0107 sobre el R2 integrado

Estado: **`CANDIDATE_NOT_APPROVED_NOT_EXECUTED`**. Fuente fijada:
`e8a20ee0879aafbcad6fef74f403d78cbe7eb0cc`, merge del
[PR 292](https://github.com/hlopezb83/liftgo/pull/292), cuyo head revisado fue
`c851174ae1f72194e00cec3a28dc50762617bba2`.

El [plan R2 congelado](README.md) y su [manifest de 107 entradas](manifest.json)
se conservan byte por byte: fijan `cebe9a94d023dc1714fa5e0585a43902e05c3a2b`,
0105/0106 y la exclusión de 0107. **El nuevo main no puede publicarse usando ese
manifest sin un plan nuevo revisado y autorizado.** Este apéndice y
`logistics-candidate.json` describen ese candidato; no amplían la autorización
del plan congelado ni habilitan SQL, publicación, contacto con un agente de
Lovable o cambios de acceso. No se ejecutó ninguna de esas operaciones.

## Bytes y dependencias del candidato

El JSON adjunto contiene las 108 entradas 0000–0107 recalculadas desde los blobs
Git exactos de `e8a20ee`. El prefijo 0000–0106 conserva exactamente los hashes,
tamaños y metadatos del plan congelado.

| Artefacto | Bytes | SHA-256 |
| --- | ---: | --- |
| `0107_quote_charge_tracking.sql` | 40557 | `b6ba356d8138421d8d6236a1be40ad0a4881c5c1403d90435fa3ba98eb862de1` |
| `meta/0107_snapshot.json` | 336 | `1e87f3926d6f77f6da26f5e278ee232fbb7da4f5a3c8963f1d552d7fdccfa057` |
| `meta/_journal.json` completo | 17488 | `78145ea95e344550fdd485ef01b696941467d5dae0bf7a253db16b7b9301aeec` |

0107 tiene idx `107`, when `1792392861355`, versión `7` y breakpoints `true`.
Su snapshot `3c6492d3-f08b-476b-b94b-9f94a7ac7fbd` encadena el prevId
`b4e20fc3-4672-41c4-b8cb-ebfe6246743b` de 0106. Los tres artefactos son UTF-8 LF.
El orden candidato es **0105 → 0106 → 0107**. Si el ledger mantuviera el estado
observado anteriormente, la selección por timestamps incluiría las tres, pero
el bloqueo del prefijo impide ejecutarlas. Hace falta una nueva lectura;
Drizzle aplica todo lo pendiente, no sólo 0107.

## Efectos de datos y operación, revisados sólo en fuente

0107 no es únicamente DDL. Ejecuta `UPDATE public.quotes SET line_items=line_items`
sin filtro: la inicialización alcanza las cotizaciones existentes de todas las
organizaciones del destino. El trigger normaliza cada partida JSON con
`quote_line_id` y `line_kind`; sólo las etiquetas exactas de logística/seguro
reciben su `charge_kind` conocido. No cambia importes para atribuir cobros.

- Los triggers ordinarios de UPDATE siguen activos. El código versionado
  incrementa `version`, actualiza `updated_at` y puede crear auditoría según el
  contexto/actor y las reglas existentes. La auditoría puede indicar cambios de
  `line_items`/versión aunque excluya el JSON de partidas de su payload guardado.
  No se afirma que sea una operación sin efectos ni que cada fila genere audit.
- Los editores abiertos deberán recargar versiones. Antes de activar se debe
  revisar el volumen real, las formas/UUID de los JSON, posibles conflictos,
  triggers instalados, volumen de auditoría y capacidad/locks del índice GIN.
  Estos datos y el coste operativo **no se midieron** en esta tarea.
- Las facturas existentes conservan `quote_charge_tracking_version = NULL`;
  las nuevas tienen default `1`. El nuevo marcador `quote_charge_ever_issued`
  comienza en `false`. No hay UPDATE de facturas históricas para inferir origen,
  asignar partidas por descripción/posición, marcar cargos pagados ni reparar
  el ledger. Tampoco se incorpora un flujo para resolver históricos ambiguos.
- Historial sin origen verificable o con importes positivos sin partidas exige
  revisión. Los formatos exactos conocidos de renta/venta sólo permiten excluir
  historial exclusivamente de equipo; no atribuyen un cargo a una cotización.
  Un descuento fijo parcial también exige revisión y no se prorratea en silencio.
- Los drafts reservan cantidad; `stamping` y cancelación fiscal pendiente la
  conservan. La cancelación permitida o fiscal aceptada libera lo correspondiente;
  una nota de crédito no libera automáticamente cantidades de origen.

La [especificación de logística del release](https://github.com/hlopezb83/liftgo/blob/e8a20ee0879aafbcad6fef74f403d78cbe7eb0cc/docs/quote-charge-tracking.md)
y los hashes/referencias del JSON delimitan esta lectura estática. El RPC nuevo
`get_quote_charge_availability` concede EXECUTE a `authenticated`/`service_role`
y valida los roles lectores existentes y la organización; sus grants y las
funciones privadas revocadas deben revisarse y contrastarse al activar. No se
presenta este candidato como libre de cambios de ACL ni como aprobación para
ampliar acceso.

## Dos componentes Edge y frontend coherentes

El release candidato incorpora ambas defensas, con bytes fijados en el JSON:

1. `stamp-payment-complement`: corrección REP de 285, sin cambio adicional en
   292. Debe verificarse su versión corregida junto con 0105 y conservarse el
   gate de **bloquear nuevas solicitudes y drenar todas las antiguas** antes de
   SQL/reapertura. Una solicitud antigua aún podría escribir `error` tras el SQL.
2. `generate-recurring-invoices`: cuatro archivos runtime cambiados por 292.
   Consulta disponibilidad autoritativa y conserva el origen/cantidad; necesita
   0107 antes de activarse. La generación recurrente y los escritores de cargos
   deben coordinarse en una ventana aprobada, sin inventar controles ni alterar
   cron, credenciales o permisos para obtenerla.

SQL y verificación posterior preceden al frontend y al Edge recurrente. No se
debe publicar el frontend nuevo sobre una base sin 0107. Tras 0107, clientes o
jobs antiguos con cargos automáticos sin origen fallan de forma cerrada y deben
recargar/actualizarse. El canal oficial, la identidad de artefactos, el vínculo
vivo y el control de la ventana siguen sin verificarse. Un despliegue de
frontend por sí solo no activa ambos Edge. No hay rollback automático aprobado:
quitar guardias o recuperar escritores antiguos requiere otra revisión.

## Evidencia histórica nueva y límite del ledger

La inspección coordinada y acotada de catálogo de 13:06:47–13:08:43 UTC, más la
consulta ACL con timestamp de servidor 13:10:23.127540 UTC del 19 de octubre,
actualiza las cinco diferencias históricas 0004–0007/0010:

- 13 funciones coinciden en cuerpo y contrato con sus definiciones actuales,
  incluidas sustituciones posteriores en 0030, 0031, 0039 y 0044.
- Los cuatro RPC bancarios coinciden con la fuente vigente y los patches
  históricos aplicables, permanecen SECURITY INVOKER y conservan los privilegios
  de tablas requeridos.
- Las 56 policies de aislamiento actuales coinciden y tienen RLS activo. Las
  57 guardias organizacionales y el trigger de vínculo de clientes coinciden.
  El conjunto incorpora los cambios de 0054/0086; el antiguo conteo de 55
  policies no describe la fuente vigente.
- Los 17 controles ACL de roles de aplicación conforman. La procedencia de un
  grant de infraestructura preexistente queda fuera de esta revisión; no se
  modificó ningún permiso ni se publica su identidad.

La fuente comparada fue `cebe9a94`; los archivos de estas definiciones no fueron
modificados por 292. Las consultas fueron lecturas separadas, no una transacción
única. Esta evidencia verifica los objetos inspeccionados, no todos los datos,
la conducta multiempresa en vivo ni la identidad del archivo SQL aplicado.

**`BLOCKED_LEDGER_DRIFT` permanece.** Los bytes históricos de esas cinco
migraciones siguen sin recuperarse. Tampoco se cambia la clasificación de 0074:
objetos actuales conformes, bytes originales sin recuperar. Las cuatro
diferencias de formato y la migración histórica 0030 retirada del journal
siguen documentadas en el plan congelado. Explicar o acotar diferencias no
autoriza reescribir hashes, archivos históricos o filas del ledger ni convierte
el prefijo actual en exacto.

## Puertas pendientes y CI

El merge `e8a20ee` terminó con [CI](https://github.com/hlopezb83/liftgo/actions/runs/39258369465),
[RLS DB](https://github.com/hlopezb83/liftgo/actions/runs/39258369380),
[Auth A/B](https://github.com/hlopezb83/liftgo/actions/runs/39258369407) y
[Gitleaks](https://github.com/hlopezb83/liftgo/actions/runs/39258369276) en éxito.
El estado exacto se registra en `logistics-candidate.json`; dependency review
quedó omitido por su condición de ejecución y no cuenta como prueba ejecutada.
El CI del head revisado pasó tras reintentar únicamente los jobs fallidos por un
timeout de 5 s en una prueba de conciliación, sin cambiar el SHA ni el timeout.
Ese antecedente no sustituye al postmerge ni demuestra activación publicada.

Antes de cualquier ejecución hacen falta revisión/autorización nuevas del lote
completo, resolución del contrato de ledger, destino y ledger frescos, runner
oficial e inyección de secretos, exclusión de ejecutores, preflight de datos y
versionado/auditoría de 0107, controles de escritores y drenaje REP, canales
oficiales y QA coordinado. Identificar un posible canal tampoco constituye
autorización para migrar o publicar. Todos esos pasos siguen sin ejecutar en
este candidato.
