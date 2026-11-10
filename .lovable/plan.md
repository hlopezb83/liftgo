# Facturapi 6 (PR #429): preparación de la prueba aislada en sandbox

Este documento es sólo un diagnóstico. En este turno no se ejecutó, desplegó ni leyó ningún secreto.

## Lo que se verificó (código en HEAD `f7554fcb`)
- La llave de cada empresa se lee en el backend, desde `billing_secrets` (`facturapi_test_key`), con `getFacturapiConfigForOrganization`. La función valida que el modo coincida con el prefijo y que la llave sea exclusiva de la empresa. El respaldo por variables de entorno `FACTURAPI_*_KEY` sólo aplica si existe una única organización.
- Las 26 funciones existentes comparten `_shared/facturapi/*` y el `deno.json`/`deno.lock` común. Cambiar a `npm:facturapi@6.0.0` en ese lugar afectaría a todas.

## Opciones de ejecución aislada y su estado
1. **Deno en el sandbox del agente.** Está disponible y ahí corren los 8 contratos con simulaciones (mocks). Para una llamada real necesitaría la llave dentro del sandbox, y eso no cumple «sólo dentro del backend». **Queda descartada para usar llaves reales.**
2. **Herramienta oficial de pruebas de funciones (`supabase--test_edge_functions`).** No está verificado si corre en el backend con acceso a `billing_secrets` o en un entorno local. **Sin verificar: no la propongo como aislada.**
3. **Función nueva y dedicada, desplegada sólo para la prueba** (por ejemplo, `facturapi6-sandbox-probe`):
   - Tendría su propio `deno.json` con `facturapi@6.0.0` y no tocaría `_shared` ni el lock común.
   - Exigiría sesión de admin de ELOGISTIX y fijaría `organization_id = fc2c10e3…`.
   - Rechazaría cualquier modo distinto de `test` y respondería sólo con resultados booleanos o códigos, nunca con la llave.
   - Bloqueo: requiere un **despliegue nuevo** y código nuevo. Ninguno de los dos está autorizado en este turno.

## Comprobación del emisor sin revelar la llave
- Leer el emisor con la llave del propio emisor sería una operación de sólo lectura. Al responder, se compararía el RFC o la razón social con `ELOGISTIX SHIPPING` y sólo se devolvería «coincide» o «no coincide».
- Falta confirmar: no verifiqué en la documentación de Facturapi qué endpoint de lectura de la organización acepta una llave secreta de emisor, en lugar de una llave de usuario. Hay que confirmarlo antes de implementar. La alternativa de solo lectura sería `invoices.list` con `limit=1` en modo test, que valida la autenticación pero no la identidad del emisor.
- Hoy no existe ninguna función que haga esta comprobación. Se necesita la opción 3.

## Bloqueos pendientes
- Autorizar el código y el despliegue de una función dedicada, sin publicar el frontend.
- Confirmar el endpoint de lectura del emisor en la documentación oficial.
- Límite: el recibo de despliegue no expone el hash activo remoto. La identidad del código desplegado sólo se demuestra con el hash de lo enviado.

## Siguiente fase (si se aprueba)
1. Crear la función dedicada, aislada por su propio `deno.json`, y sus pruebas con simulaciones.
2. Desplegar solamente esa función.
3. Invocar una vez la comprobación del emisor y reportar sólo booleanos.
4. Después, en un paso aparte y con autorización, crear, consultar, cancelar y actualizar estado de documentos ficticios en sandbox.
