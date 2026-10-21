# Exportación operativa para contador, versión 1

## Objetivo y acceso

En Reportes, «Exportar para contador» descarga un XLSX local de la empresa y periodo seleccionados. Es soporte documental operativo, no contabilidad oficial, pólizas, balanza, catálogo de cuentas ni un formato certificado de importación a CONTPAQi. No envía información a terceros.

Se requieren los permisos existentes de acceso financiero y lectura de Reportes. Cada sección requiere además lectura de Facturas, Facturas de Proveedor o Gastos, respectivamente. No se crean permisos. Consultas autenticadas con RLS y filtro de empresa; las secciones denegadas no se consultan. Cambiar identidad, empresa, permisos, fechas o filtros invalida irrevocablemente la extracción, incluso al regresar al contexto inicial. Cancelar libera la interfaz inmediatamente.

## Contenido

- Control: empresa, rango, extracción, alcance, exclusiones, contadores de faltantes y advertencias.
- Totales por hecho: separados por hoja, moneda efectiva, estado y ambiente. Nunca sumar estos hechos entre sí.
- Ventas: identidad, cliente/RFC capturados, emisión, importes, impuestos capturados, TC, estado, ambiente, claves SAT y cobertura.
- Notas de crédito: identidad, factura relacionada, importes originales y estado. No se inventa un TC propio ausente.
- Cobros: identidad, factura, importe/moneda capturados, moneda efectiva y fuente, fecha, referencia y REP relacionado.
- REP asociados a cobros del periodo: referencias documentales, no un ingreso adicional. Cancelar un REP no equivale a devolver el cobro.
- Compras: factura de proveedor, conceptos, importes/retenciones capturados, estado y vínculo legado. Nombre/RFC de proveedor son del catálogo actual autorizado, no una copia fiscal histórica.
- Pagos a proveedores: hechos de pago, factura y moneda heredada explícita.
- Gastos operativos: sólo empresa explícita, descripción e importe persistidos. Sin moneda/IVA inventados. Un vínculo a compra se marca y no se suma de nuevo a Compras.
- Referencias: padres fuera del periodo necesarios para trazabilidad, identificados como no sumables.

## Semántica

Fechas civiles inclusivas: emisión para ventas, NC y compras; fecha de pago para cobros/pagos; fecha del gasto para gastos. Borradores y Sandbox/E2E identificados se excluyen por defecto y pueden incluirse explícitamente. Cancelados se conservan separados; ambiente desconocido nunca se declara producción. Compras y gastos no tienen ambiente fiscal verificable en su registro.

Moneda nula legada de factura equivale a MXN conforme al contrato existente. Moneda nula de cobro hereda la factura; se conserva el valor capturado y su procedencia. Monedas vacías/no verificables y XXX no se agregan, aunque se conservan las filas con advertencia y contador. Conversión de ventas/compras reutiliza las reglas canónicas: TC 1 en divisa no es válido. No se recalculan impuestos, saldos fiscales ni datos faltantes. Un importe obligatorio no finito detiene la exportación.

## Integridad y límites

Consultas secuenciales con paginación por ID y validación de orden, sin límite silencioso de 10 000 filas. Padres se consultan por IDs explícitos dentro de la misma empresa; relaciones faltantes detienen el paquete. El filtro de proveedor sólo permite datos del catálogo de la empresa autorizada. Gastos legados sin empresa verificable quedan fuera: no se consultan otras empresas para atribuirlos ni contar exclusiones imposibles de verificar.

La extracción paginada NO es un snapshot transaccional ni un cierre bloqueado; puede haber cambios concurrentes. La hoja Control lo declara. El usuario debe conciliar contra su cierre oficial. El límite de filas de Excel causa error explícito, no truncamiento. Periodos muy grandes pueden requerir dividirse por memoria del navegador.

Textos, UUID e IDs se escriben como celdas de texto explícitas, nunca fórmulas, incluso con prefijos =, +, -, @. No se extraen cuentas bancarias ni notas libres generales. La descripción transaccional del gasto y factura sí se incluye. Sin nuevas dependencias, migraciones, permisos ni llamadas fiscales.

Esta etapa sólo produce Excel; no incluye XML/PDF ni ZIP. La estructura de datos y las referencias documentales pueden reutilizarse en una etapa posterior sin descargar ni publicar documentos ahora.

## Etapa 5: paquete opcional de soportes existentes

La opción XML/PDF genera un único ZIP con el Excel de la misma extracción en memoria, los soportes existentes y un índice JSON/hoja Archivos. No vuelve a consultar otro conjunto de movimientos. Excel solo permanece disponible. Las columnas de rutas/XML se solicitan únicamente al elegir el ZIP y no se exportan como columnas del libro ni del índice.

Los candidatos proceden de los IDs realmente incluidos en las hojas, incluidas referencias fuera del periodo identificadas como tales. Cada XML y PDF cuenta como un archivo: máximo 500 candidatos antes de consultar Storage. Se descargan secuencialmente, con máximo 10 MiB por archivo y 100 MiB acumulados de soportes. El Excel y el índice no forman parte de ese límite de soportes. El XML persistido incluido en filas ya se obtuvo en la consulta autorizada: su límite se comprueba al empaquetarlo, no se presenta como límite de bytes de la consulta SQL.

Para Storage se comprueba metadata antes de descargar y se lee mediante stream autenticado con corte por tamaño y AbortSignal. La metadata no sustituye el límite efectivo del stream. Se conserva versión cuando Storage la devuelve. La cancelación durante metadata no puede iniciar una descarga tardía; los cambios de identidad, empresa, permisos y filtros invalidan también resultados tardíos A→B→A.

Sólo se resuelven rutas del bucket esperado y prefijo de empresa actual. URLs antiguas sólo se aceptan si pertenecen al origen configurado y a la ruta Storage prevista; sus firmas nunca se reutilizan. Los writers actuales y las políticas 0032 exigen prefijo de organización. Rutas antiguas sin pertenencia verificable se señalan `No verificable`, sin recuperación del PAC ni ampliación de permisos. Storage vuelve a autorizar usando la sesión actual. Las compras sólo admiten el bucket verificado `supplier-bill-cfdi-xml`; otros PDF legados se indican como no verificables.

Se validan MIME y contenido: PDF con cabecera y terminador, XML CFDI con namespace esperado y UUID coincidente cuando se conoce. No se admiten DTD/entidades. No es una validación fiscal ni antivirus. Los nombres son saneados y únicos; el índice sólo registra ID, folio, UUID, alcance, formato, estado, nombre interno, tamaño y SHA-256, nunca URLs privadas o tokens.

Un faltante, denegación, origen no verificable, formato inválido o límite produce ZIP `INCOMPLETO`, indicador visible y estado individual. No se muestra éxito completo. Exceder 500 candidatos detiene la exportación en lugar de truncarla. No se llama `download-cfdi`, al PAC ni a funciones de timbrado; no se escriben cachés, tablas ni Storage. No hay cambios de roles, grants o políticas.

La dependencia directa `fflate` 0.8.3 (MIT) ya existía en el lock transitivamente. Sólo se promueve esa versión exacta, sin actualizar el grafo de paquetes. ZIP usa almacenamiento sin compresión adicional para evitar recomprimir PDF/XLSX.

QA de navegador pendiente antes de liberar: comprobar un paquete cercano al máximo. Aunque la descarga se cancela y un resultado obsoleto no se guarda, el CRC/ensamblaje ZIP con nivel 0 tiene trabajo síncrono; el botón de cancelar se atiende al regresar al event loop, no interrumpe ese tramo de CPU. No se anuncia cancelación instantánea del ensamblaje.

Antes de descargar, Excel y ZIP ceden un turno al event loop mediante una macrotarea y vuelven a validar el contexto. Así una cancelación encolada durante la serialización se procesa antes de crear la descarga; no se depende sólo de microtareas/promesas ya resueltas. Pruebas específicas programan la cancelación durante serialización y verifican que no se crea URL ni se hace click.
