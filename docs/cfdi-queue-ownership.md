# Propiedad de trabajos fiscales

El consumidor `process-cfdi-retry-queue` reclama y termina cada trabajo con
su ID, empresa, estado observado y `updated_at`. El token de propiedad usa el
valor devuelto por PostgreSQL, porque el trigger de la tabla cambia la fecha.
Dos consumidores que leyeron el mismo trabajo huérfano no pueden reclamarlo
ambos; terminar exige que siga en `processing` con el token obtenido.

## Recuperación y errores

- La factura se consulta en la empresa del trabajo, sin adoptar la empresa del
  payload. Las cancelaciones comprueban también la referencia empresarial antes
  de invocar otra función. La lectura tras el refresh conserva ese alcance.
- Se comprueba la propiedad antes del lookup, invocación, refresh y guardado de
  una recuperación. Un cambio detectado termina ese procesamiento sin cambiar
  el trabajo del nuevo dueño.
- El guardado de una recuperación compara empresa, fecha y estado de la factura;
  exige que siga sin UUID ni ID del proveedor. Se comprueba el error y la fila
  devuelta antes de anunciar éxito. Los cambios concurrentes se conservan.
- Un ID pendiente de Facturapi se guarda con su ambiente y estado `stamping`;
  no se inventa UUID ni se declara `stamped`. XML, PDF y conciliación final
  continúan en el reconciliador existente.
- Si la factura recuperada no se pudo guardar, se difiere sin consumir un intento
  de emisión. Si falla la terminación de la cola, se informa `queue_write_error`;
  si otro proceso tomó el trabajo, se informa `lease_lost`. Ninguno es éxito.
- La invocación de la función fiscal tiene un timeout de 15 segundos. Los
  resultados inciertos conservan las protecciones idempotentes del documento.

## Evidencia y límites

Los tests incluyen consumidores concurrentes, token modificado por el trigger,
trabajo tomado durante el GET de Facturapi, fallo de persistencia, documento
cambiado, dos empresas y las tres cancelaciones. Dos regresiones usan el SDK
real con transporte en memoria y fallan contra `main` anterior.

Los filtros son comprobaciones optimistas, no una transacción que abarque HTTP:
una operación remota puede continuar si el dueño cambia después de invocarla.
La propiedad no sustituye los claims idempotentes de timbrado/cancelación. El
guardado del documento y la terminación de la cola son transacciones separadas;
una recuperación persistida sigue siendo conciliable si falla la segunda.

La recuperación manual de Plataforma aún depende de la migración 0099, su
control de revisión y la vinculación histórica de llave/ambiente. Este cambio
no habilita esas acciones ni la instrumentación Deno de Sentry.
