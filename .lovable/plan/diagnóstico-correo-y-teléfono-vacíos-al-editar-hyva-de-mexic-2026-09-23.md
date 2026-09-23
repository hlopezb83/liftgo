# Diagnóstico: Correo y Teléfono vacíos al editar HYVA DE MEXICO

## Qué se verificó (sólo lectura)
- Base de datos: HYVA (`c82fcc1b…`) tiene correo (19 caracteres) y teléfono (15), tipo texto, sin espacios raros. Está ligado a HERREN ENERGY y Empresa Prueba (ambos activos).
- Código actual: la consulta de detalle pide `email, phone`; `buildEditInitialData` los copia; `CustomerFormDialog` hace `form.reset({...empty, ...initialData})`; `ContactSection` usa `name="email"` y `name="phone"` correctos; `Input` no altera valores; `optionalEmail` no transforma. La tarjeta y el diálogo leen el MISMO objeto `customer`.
- Reproducción en la vista previa (código actual del repositorio), con la cuenta de operador en HERREN ENERGY: al pulsar Editar, los 10 campos llegan llenos, incluidos Correo (19) y Teléfono (15). No se guardó nada.

## Conclusión
Con el código actual el fallo NO se reproduce, así que la causa no está confirmada. Hipótesis por orden de probabilidad:
1. La versión publicada (8.42.4) no coincide con el código actual (el publicado quedó atrás de algún arreglo o de un cambio no sincronizado).
2. Autorrelleno del navegador / gestor de contraseñas: los campos `type="email"` y teléfono sin `autoComplete` son los únicos que Chrome/1Password suelen tocar; justo esos dos son los que salen vacíos, en ambas pestañas.
3. Diferencia por contexto de Empresa Prueba (menos probable: la tarjeta, que sí muestra los datos, usa el mismo objeto).

## Pasos para confirmar (los haces tú, sin costo)
1. En la app publicada, abre Editar en ventana de incógnito sin extensiones. Si ahí aparecen llenos, es la hipótesis 2.
2. Si siguen vacíos en incógnito: DevTools > Network, filtra `customers`, abre la respuesta del detalle y confirma que trae `email` y `phone`. Si los trae y el input sale vacío, es la hipótesis 1: vuelve a publicar y repite.

## Arreglo mínimo propuesto (para tu parche en GitHub)
1. `ContactSection.tsx`: pasar `autoComplete="off"` a Correo y Teléfono (y `type="tel"` al teléfono). `TextField` ya acepta ambas props.
2. Protección anti-borrado (lo más importante): en `useCustomerDetailActions.handleEditSubmit`, enviar sólo los campos que el usuario cambió (`form.formState.dirtyFields`) o, más simple, en la edición no convertir a `null` un campo que venía con valor y llegó vacío sin estar marcado como modificado. Así un prellenado fallido nunca borra datos.
3. Prueba de regresión: renderizar `CustomerDetailPage` (no sólo el diálogo) con un cliente mockeado con correo/teléfono, pulsar Editar y afirmar que los inputs traen valor; y un test de que guardar sin tocar Correo no envía `email: null`.

## Cómo verificar el arreglo
- Test unitario nuevo en verde localmente/CI.
- En publicado: abrir Editar en HYVA (navegador normal e incógnito), ver Correo y Teléfono llenos, cambiar sólo Notas, guardar y confirmar en la tarjeta que correo y teléfono siguen.
