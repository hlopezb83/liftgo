# Cierre de Sentry: sourcemaps del build (diagnóstico de solo lectura)

## Evidencia observada
- Copia de Lovable: HEAD `da19ca69a28e2d8a5297055de6b73134cf7769a0`, no `c2f662b8…`. La configuración se leyó desde esta copia.
- `SENTRY_AUTH_TOKEN` existe como secret de ejecución del proyecto (Cloud/Edge). No se mostró su valor.
- No está en el entorno del proceso de construcción del sandbox: `test -n` dio ausente. Los secrets de ejecución no se inyectan al build; las Build Secrets del workspace sí.
- Como el token falta, `vite.config.ts` usa `build.sourcemap: false` y no agrega `sentryVitePlugin`. En el build de Lovable no se generan `.map` ni se suben. Esto explica "No source maps uploaded" y que se vean `/_ssr/*.mjs` compilados.
- No hay logs de subida porque el plugin nunca se activa. No existe `dist/` en el sandbox para revisar.

## Fases si hubiera token (lectura de la configuración, sin ejecutar)
- `vite.build.sourcemap` cubre los entornos de Vite (client y SSR de TanStack). El bundle final de Nitro (`dist/server/index.mjs`, preset cloudflare-module) tiene otra configuración de sourcemap. No está verificado que reciba maps sin `nitro.sourcemap: true`.
- `sentryVitePlugin` sube en `writeBundle` de cada entorno Vite, y después borra los `.map` con `filesToDeleteAfterUpload: ./dist/**/*.map`. Si la salida de Nitro se escribe después, sus maps podrían quedar fuera de esa subida. No está confirmado.

## Siguiente paso propuesto (lo haces tú en Git)
1. Agrega `SENTRY_AUTH_TOKEN` en Workspace Settings → Build Secrets. Así estará disponible en el build de hosting. La secret de Cloud no lo hace.
2. Agrega `nitro.sourcemap: true` y valida con un build en CI que existan `dist/server/**/*.map` antes de subirlos. Si el plugin de Vite no los alcanza, haz la subida post-build con `sentry-cli sourcemaps inject/upload dist` y borra los maps al final.
3. Publica y confirma en Sentry que el siguiente evento se ve con código fuente.

No se cambió código, secrets ni despliegues.
