# Respuesta: aliases de deno.json en el despliegue de Lovable Cloud (solo lectura)

No se editó código, no se desplegó nada y no se tocaron datos.

## Verificado (evidencia en el proyecto, commit e6db1c45b565)

- Existe un solo `supabase/functions/deno.json` (global) y un `deno.lock`. Ninguna función tiene su propio `deno.json` ni `import_map`.
- El `deno.json` global solo tiene `nodeModulesDir: "auto"` y una regla de lint; no hay `imports`.
- `supabase/config.toml` declara `[functions.*]` sin `import_map` ni `entrypoint`.
- Los imports directos actuales: `npm:@sentry/deno@10.76.0` en `_shared/edgeSentry.ts`, `edgeSentryPrivacy.ts`, `edgeSentryTestHelpers.ts`; `npm:facturapi@5.1.0` en `_shared/facturapi/client.ts`. El lock los fija en 10.76.0 y 5.1.0.
- La herramienta de despliegue solo recibe `function_names` (lista de nombres). No acepta rutas, import maps ni un `deno.json` por función.
- Por experiencia previa en este proyecto, el despliegue de funciones con el `deno.json` global actual (incluido `nodeModulesDir`) y el `deno.lock` funcionó; funciones como `parse-csf` arrancaron con `npm:@sentry/deno@10.76.0` (log `liftgo.edge.sentry`, SDK 10.76.0).

## No demostrado (desconocido)

- Si el despliegue real incluye y aplica la clave `imports` del `deno.json` global. Hoy no hay `imports`, así que nunca se ha ejercitado: no hay evidencia a favor ni en contra.
- Si el despliegue usa el `deno.json` global o si solo lo respeta el bundler cuando está dentro de la carpeta de cada función.
- Si una función que importa `_shared/*` resuelve aliases desde el `deno.json` global al empaquetarse.
- Cloud no muestra hash ni manifiesto del paquete desplegado, así que no se puede inspeccionar qué archivos de configuración viajan.

## Recomendación (mínimo cambio compatible, para que lo haga el usuario en Git)

1. No cambiar todavía los imports en `_shared`. Primero agregar `imports` al `deno.json` global con las mismas versiones exactas:
   `"npm:facturapi": "npm:facturapi@5.1.0"` y `"npm:@sentry/deno": "npm:@sentry/deno@10.76.0"` (mapa de especificador exacto, sin alias nuevos tipo `@sentry/deno`). Así Dependabot ve las versiones y los imports actuales `npm:...@version` siguen funcionando igual.
2. Canario de bajo riesgo: cambiar solo un archivo `_shared` usado por una función inocua (por ejemplo `parse-csf` con `edgeSentry.ts`) a `npm:@sentry/deno` sin versión, desplegar únicamente `parse-csf` y hacer OPTIONS anónimo; revisar el log `liftgo.edge.sentry` (SDK 10.76.0, `active: true`). Si falla el arranque, revertir solo esa función.
3. Solo si el canario pasa, migrar `facturapi` (función fiscal, con OPTIONS anónimo, sin timbrar) y el resto de imports.
4. Alternativa sin riesgo de despliegue: mantener los imports con versión en línea y configurar Dependabot/Renovate para leer `deno.lock` o usar un `deno.json` solo para herramientas. Es lo más seguro si el canario falla.
5. Mantener `deno.lock` sincronizado y commiteado junto con el cambio de `imports`.

## Detalles técnicos

- No se ejecutó ningún despliegue para probar el comportamiento; hacerlo sería la única forma de demostrarlo.
- Riesgo principal: que el empaquetado ignore `imports` del archivo global y falle en runtime con "Relative import path ... not prefixed". Por eso el paso 1 mantiene las versiones literales en el código hasta validar con el canario.
