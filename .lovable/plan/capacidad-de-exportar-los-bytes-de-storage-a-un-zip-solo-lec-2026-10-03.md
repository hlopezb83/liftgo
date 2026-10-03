# Capacidad de exportar los bytes de Storage a un ZIP (solo lectura, nada ejecutado)

## Respuesta corta
No existe una herramienta nativa de "descargar bucket/carpeta" en mi entorno. Sí es posible una ejecución temporal (sin código ni funciones permanentes en el proyecto) que descargue archivo por archivo y arme un ZIP. Nada de esto se ejecutó.

## Evidencia observada ahora (consultas de solo lectura)
- Conteo en `storage.objects` (sin contar `database_export_03_10_26`): 658 archivos y 36,843,697 bytes. Coincide exactamente con tu cifra.
  - cfdi-files 366 / 17,952,110 B
  - supplier-payment-receipts 112 / 12,098,157 B
  - documents 13 / 2,475,064 B
  - feedback-screenshots 3 / 3,412,834 B
  - supplier-bill-cfdi-xml 164 / 905,532 B
  - payment-proofs 0 (vacío)
- Los 7 buckets son privados.
- Herramientas de Storage que tengo: crear/actualizar bucket y `storage_upload` (solo SUBE del sandbox al bucket). No hay herramienta de descarga ni de listado de bytes.
- El sandbox tiene `curl`, `python`, `zip`, red de salida y la CLI `lovable`. Puedo listar rutas completas (incluidas carpetas anidadas) con `storage.objects`, así que las carpetas no son un obstáculo.
- Las políticas de lectura en `storage.objects` son para `authenticated` con rol de personal (admin/administrativo/auditor, mecánico en parte de `documents`) y con ruta dentro de la organización actual del usuario. Clientes solo ven lo propio.

## Rutas posibles y límites
1. Sesión de un usuario real (única ruta que recomiendo)
   - Se mina una sesión con `lovable auth-session --user <uuid>`; pide tu aprobación explícita en pantalla y no imprime tokens.
   - La descarga va por la API de Storage con esa sesión, por lo que aplica RLS: solo se obtiene lo que ese usuario puede leer (su organización y rol).
   - Límite: si hay archivos de otra organización o rutas que la política no cubre, quedarían fuera. Se detectaría comparando contra el conteo/bytes de arriba; no puedo garantizar completitud antes de probar.
2. Llave de servicio (rol que ignora RLS)
   - Aparece una variable con ese nombre en el entorno del sandbox, pero no la leí ni la usaré: tu instrucción es no tocar secretos y la plataforma indica que esa llave no debe usarse así. Por eso no la propongo.
3. Descarga desde el navegador de la UI de Cloud: ya la tienes (solo archivos seleccionados); no puedo automatizarla.

## Entrega y privacidad
- El ZIP se armaría en `/tmp` y se entregaría como archivo descargable de esta conversación (no se crea bucket nuevo ni se sube al bucket). Ese archivo contiene documentos fiscales: quedaría asociado a tu proyecto, no es un bucket privado con RLS. Si prefieres un destino privado, `storage_upload` a un bucket privado es posible pero escribe en Storage (requiere tu autorización aparte).
- Límites de ejecución: 600 s por comando; 36.8 MB y 658 archivos caben holgadamente, por lotes.

## Si apruebas ejecutar (siguiente paso, no ahora)
1. Tú indicas qué usuario admin/administrativo usar y apruebas la sesión.
2. Listar rutas por bucket desde `storage.objects` (solo lectura) y descargar con esa sesión.
3. Verificar por bucket: archivos y bytes vs. los números de arriba, y hash de cada archivo; reportar faltantes sin divulgar nombres sensibles.
4. Generar el ZIP en `/tmp`, entregarlo y borrar temporales. Sin cambios al código, SQL, Auth, RLS, secretos ni despliegue; changelog sin cambios (no hay cambio de producto).

## Datos que faltan para decidir
- ¿Qué usuario (y organización) usar? Si hay más de una empresa con archivos, la ruta 1 podría no cubrir todo.
