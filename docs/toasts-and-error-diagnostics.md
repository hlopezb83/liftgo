# Auditoría de toasts y diagnósticos — LiftGo

## Alcance

La auditoría inicial revisó 260 llamadas de notificación en 116 archivos de producción. La revalidación de 8.43.14 inventarió 268 llamadas públicas en 118 archivos. Sólo `appFeedback.ts` y el contenedor `sonner.tsx` importan Sonner. Se revisaron también los errores locales de soporte, operadores, recuperación, integraciones y timbrado, las pantallas de consulta y las barreras de errores React/router.

## Revalidación de 8.43.15

- Las copias de identificadores fiscales, datos del receptor, invitaciones, recuperación y transferencias usan `copyWithFeedback`. Un rechazo conserva la causa original, ofrece JSON y selección manual, y no anuncia éxito. El dato copiado y los enlaces de un solo uso no se añaden al diagnóstico.
- Un formulario de cotización incompleto usa `notifyValidation`: aviso breve, `VALIDATION_FAILED` y fase `validation`; conserva los mensajes de campo.
- En móvil, el diálogo reserva espacio debajo de la altura real de los avisos, incluidos los avisos expandidos. El título, el primer campo y las acciones permanecen dentro de su área desplazable; al cerrar el aviso se restaura el tamaño normal. Abrir detalles sigue descartando el toast de origen.
- En la actualización del calendario, QueryCache conserva la responsabilidad del error de consulta. La barra controla el estado de carga y confirma éxito sólo si todas las consultas terminaron bien. Un rechazo inesperado de la tarea queda manejado.
- Las acciones de copiar datos fiscales y bancarios conservan un objetivo táctil de al menos 44 px y `type="button"`.

Las regresiones cubren copia rechazada y portapapeles ausente, confirmación posterior a la escritura, JSON sin enlace copiado, cotización inválida, refresco fallido con un solo aviso y reserva/restauración de espacio móvil. La comprobación visual y el CI de la entrega se registran por separado; esta documentación describe el comportamiento implementado.

## Hallazgos corregidos, por prioridad

1. **P1 — La copia de errores producía texto plano.** Los avisos ofrecen Copiar JSON y Ver detalles; el diálogo presenta JSON válido y seleccionable.
2. **P1 — Los errores de operaciones asíncronas carecían de diagnóstico.** Conservan la excepción original y actualizan el mismo toast de carga; una respuesta fallida no deja un spinner huérfano.
3. **P1 — La empresa quedaba siempre vacía en el diagnóstico.** Se utiliza el ID verificado y el nombre ya cargado en el caché de esa identidad, incluida la identidad mínima de la barra lateral. La verificación publicada detectó este último caso en pantallas que no consultan datos fiscales completos; se corrigió en 8.43.2. No se agregan consultas ni se lee el nombre de otra empresa. El Centro global conserva empresa nula.
4. **P1 — Copiar podía fallar sin salida útil.** No se anuncia éxito antes de confirmar el portapapeles; un rechazo abre el diagnóstico para copia manual. Cambiar de error reinicia la confirmación de copia.
5. **P1 — Datos de diagnóstico de una sesión anterior podían permanecer visibles.** Cambiar de usuario descarta avisos y el diálogo; cerrar el diálogo libera su reporte.
6. **P2 — Errores silenciosos sólo mostraban texto.** Soporte, capturas, operadores, comprobaciones, incorporación de catálogos y recuperación conservan su error y ofrecen JSON. Las barreras React y del router funcionan sin los proveedores de la app.
7. **P2 — Algunos errores ignoraban el título contextual.** El mensaje del llamador se utiliza como título y no se repite debajo; los títulos genéricos dejan de mostrar fases técnicas como «mutation».
8. **P2 — Advertencias y validaciones no ofrecían diagnóstico.** Ambas incluyen acciones JSON; los errores recuperables usan apariencia de advertencia.
9. **P2 — Fallos parciales omitían causas.** El JSON de facturación recurrente conserva todas las reservas fallidas y periodos omitidos; un fallo al limpiar un comprobante conserva el error de Storage.
10. **P2 — Se perdían estados HTTP de objetos/cadenas de error.** Se conservan `status`, `statusCode`, SQLSTATE y estado de la Response en la causa; no se consume su cuerpo desde el renderer.
11. **P2 — El reporte no era una instantánea segura para serializar.** El contexto se copia al generar el reporte; ciclos, BigInt y propiedades calculadas no rompen JSON. Se ocultan contraseñas, tokens y llaves sin borrar folios ni los identificadores fiscales útiles.
12. **P3 — Acciones pequeñas y cierre fuera de la tarjeta.** Botones de al menos 44 px, cierre dentro de la tarjeta, separación uniforme, texto con ancho disponible y colores semánticos. La inspección publicada comprobó que el borde izquierdo heredado no se aplicaba; 8.43.2 utiliza el estado real de Sonner para mostrar los cuatro acentos de color. Las acciones de los avisos siguen funcionando sobre formularios modales sin cerrarlos ni activar su descarte; se conservan los demás bloqueos y confirmaciones del formulario.
13. **P3 — Etiquetas de accesibilidad en inglés y margen móvil incompleto.** Región y cierre en español; posición bajo el encabezado móvil y margen para el área segura. La verificación de 390 px detectó un contenedor más ancho que el espacio útil y un aviso superpuesto al diálogo. 8.43.2 ajusta el contenedor a ambos márgenes y descarta el aviso de origen al abrir sus detalles, conservando el JSON en el diálogo.
14. **P3 — Historial de cambios duplicaba avisos globales/locales.** El hook que muestra su propio aviso silencia el duplicado global.

## Contrato de uso

- El aviso principal de un error desconocido usa una explicación en español y pide comprobar el estado antes de repetir cambios. La excepción original se conserva en el JSON; las traducciones conocidas y las descripciones contextuales del llamador siguen teniendo prioridad.
- «Cancelado» y «Timbrado» sólo describen un resultado fiscal confirmado. Una solicitud pendiente informa su estado sin prometer UUID ni cancelación final.

- Usar `notifyError({ error, title, ... })` con la excepción original. `message` sigue soportado como título contextual.
- Usar `notifyValidation` para datos que el usuario debe corregir; los errores de transporte o servidor siguen siendo errores.
- Usar `copyWithFeedback(valor, etiqueta)` para copiar datos con confirmación y aviso recuperable. No pasar el valor copiado como contexto de error.
- En operaciones que actualizan consultas, elegir un solo responsable del error. No envolver un refetch con otro toast de error cuando QueryCache ya muestra el diagnóstico.
- Pasar `error` a `QueryErrorState`/`ErrorState` cuando esté disponible. Un componente antiguo que sólo recibe un booleano ofrece un reporte del estado visible y declara `originalErrorAvailable: false`; no inventa una excepción ni un estado HTTP. El aviso global conserva la excepción original de la consulta.
- El botón Reintentar de `QueryErrorState` sólo repite la consulta y usa `type="button"`, incluso dentro de un formulario; sus acciones conservan un área de al menos 44 px.
- Los detalles se copian sólo por acción del usuario; no se envían automáticamente al Centro de Plataforma.
- Sonner mantiene persistentes los fallos críticos; los avisos recuperables mantienen sus duraciones y el usuario puede abrir el diálogo para conservar el JSON.
- No se modifican tablas, permisos, RLS, credenciales ni dependencias.

## Verificación

Los resultados exactos de CI y la comprobación visual publicada se registran en el reporte local de esta auditoría. Las pruebas cubren JSON parseable, copia rechazada, cambio de error, contexto inmutable, empresa verificada, ciclos, BigInt, credenciales redactadas, causas HTTP y transición asíncrona sin duplicar el identificador.
