# Estado vigente de R2 y límites de la evidencia

Corte: 2026-10-20 00:34 UTC. Este resumen sustituye únicamente las afirmaciones de estado pendiente de los planes históricos de esta carpeta. No reescribe sus resultados, manifiestos, hashes, snapshots ni decisiones originales; cada uno conserva su corte temporal.

## Hechos separados por capa

- **Base de datos:** 0105–0107 fueron aplicadas mediante el control transaccional 0108. El [recibo técnico de activación](../release-0105-0108/RECEIPT.md) registra la llamada oficial, los cuatro registros añadidos, las aserciones y la conservación de las 106 filas históricas. Posteriormente se aplicaron 0109 y el recibo de control 0110. Los planes previos que dicen que nada fue aplicado ya no describen este estado.
- **Publicación comprobada:** versión pública **8.44.15**, revisión `d229a2ec923bc44bb684dda923d259b0abedf833`, despliegue `10e647c1-01dd-46dc-8108-8ee419f0fa27`. Sustituye la referencia publicada anterior `433dcc44`. Esta confirmación corresponde a la activación coordinada por separado; este PR documental no publica frontend, funciones ni servidor.
- **Código:** main observado `d229a2ec923bc44bb684dda923d259b0abedf833` incluye [PR298](https://github.com/hlopezb83/liftgo/pull/298), [PR299](https://github.com/hlopezb83/liftgo/pull/299), [PR300](https://github.com/hlopezb83/liftgo/pull/300) y [PR291 Facturapi 5.2.0](https://github.com/hlopezb83/liftgo/pull/291). No confundir esta publicación comprobada con una autorización para desplegar cambios posteriores.
- **Comprobación focalizada publicada:** pasaron las rutas de retorno mediante skip-link y de factura inicial después de una extensión. La lectura SQL independiente final confirmó el periodo original 23–24 de octubre en USD, tipo de cambio 17.5, renta 200 y logística 25 (total 225); consumo logístico 0.5 + 0.5 = 1 conforme a la cotización y extensión previa 25–26 de octubre intacta (total 200). No se extrapola esta comprobación focalizada a toda la auditoría.
- **Dependencias:** los PR288–290 se actualizan y validan por separado. No se incluyen como desplegados ni aprobados por este documento.

## Cobertura de auditoría y límites

La ejecución de navegador del 19 de octubre no constituye 22/22 casos aprobados. Distingue casos observados en Sandbox, pruebas aisladas y escenarios no ejecutados: respuesta PAC perdida y recuperación durable real, carreras alojadas, ciclo recurrente fresco, dispatcher y móvil no quedaron demostrados de extremo a extremo. Los defectos de retorno mediante skip-link y selección de factura inicial después de una extensión se documentaron sin ocultarlos mediante borrado de fixtures. Ambas correcciones posteriores tienen ahora publicación y comprobación focalizada de navegador aprobada, pero eso no cierra los demás escenarios pendientes ni convierte toda la matriz en aprobada.

No inferir que una prueba unitaria, SQL local o CI equivale a timbrado real, ejecución alojada o despliegue. Los inventarios de auditoría conservados son históricos; no son saldos actuales ni instrucciones para repetir operaciones.

## Conservación y alcance de este PR

Los 28 archivos originales de PR287 se conservan byte por byte respecto de `4490ac7d6cac8f1943480d41ae6d61e84ddbc867`. Se añade este resumen como archivo 29 y se actualiza la descripción del PR. La base se sincroniza con main sin cambiar código funcional ni archivos de versión.

Este cambio no ejecuta SQL remoto, no modifica permisos, no activa cron, no llama al PAC y no despliega. Cualquier operación posterior requiere su alcance autorizado, revisión y verificaciones correspondientes; los planes históricos no son una orden vigente de ejecución.
