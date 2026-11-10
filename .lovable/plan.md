# Diagnóstico de alcanzabilidad del preflight (a181ff4c1) y corrección mínima propuesta

## Hallazgos (lectura de código, sin invocar)

- Guarda en `core.server.ts:119`: rechaza con 403 `preview_only` salvo que `development === true` **y** el `Origin` sea exactamente uno de `PREVIEW_ORIGINS` (`policy.ts:18-19`): `http://localhost:8080` y `https://id-preview--e25ace4a-….lovable.app`.
- `development` viene de `import.meta.env.DEV` (`preflight.functions.ts:34`), que Vite fija en compilación: `true` sólo con `vite dev`; `false` en `vite build` (también en las vistas previas estáticas, que usan compilación de producción).
- Resultado por superficie:

```text
Superficie                                   DEV     Origin en lista   Resultado
Iframe editor  e25ace4a-….lovableproject.com true*   NO                403 preview_only
Static         id-preview--….lovable.app     false   sí                403 preview_only
Publicada      liftgo.lovable.app            false   NO                403 (correcto)
localhost:8080 (sandbox del agente)          true    sí                única vía; sin sesión real
```
`*` Inferencia: la vista previa en vivo `lovableproject.com` sirve el servidor de desarrollo Vite del sandbox (`vite dev`), por lo que DEV sería `true`. No verificado empíricamente para no invocar.

- Conclusión: con las guardas actuales el endpoint **no es alcanzable** desde la sesión real verificada; la entrada `id-preview--` es inalcanzable por diseño (DEV=false), así que no aporta.
- Límite: una llamada POST desde el mismo origen normalmente incluye `Origin`; si un proxy lo omitiera, también fallaría cerrado (`""`). No comprobado.

## Corrección mínima exacta (pendiente de su aprobación)

1. `src/lib/qa/facturapi6-preview/policy.ts`: reemplazar la entrada `https://id-preview--e25ace4a-172e-4082-a037-00473dacf2f2.lovable.app` por `https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com` (coincidencia exacta, sin comodines). Conservar `localhost:8080`.
2. Mantener sin cambios el requisito `import.meta.env.DEV`: garantiza exclusión de la app publicada aunque se falsifique `Origin` (la publicada se compila con DEV=false).
3. Pruebas offline: añadir caso permitido para el origen `lovableproject.com` con DEV=true; casos 403 para ese mismo origen con DEV=false, para `id-preview--` y para `liftgo.lovable.app`, y para variantes parecidas (subdominio extra, `http://`, puerto).
4. README `qa/facturapi6-preview-preparation`: cambiar «todavía NO autorizada para ejecución» por «autorizada por el usuario; ejecución bloqueada hasta aprobación de la revisión independiente (gate pendiente)». Actualizar documentación de orígenes y regenerar MANIFEST.
5. Changelog: entrada patch.

Sin invocación, secretos, BD, publicación ni cambios al SDK operacional.
