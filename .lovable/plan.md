# Inspección de solo lectura previa a release (candidato f6bcdb5b)

No se editó código, no se ejecutó SQL, no se publicó nada, no se tocó Auth ni secretos.

## 1. Variables en el runtime publicado

| Variable | Estado en hosting publicado | Origen de la evidencia |
| --- | --- | --- |
| SUPABASE_URL | NO VERIFICABLE | Solo existe evidencia de sandbox/`.env` local; ninguna herramienta expone el entorno del hosting |
| SUPABASE_PUBLISHABLE_KEY | NO VERIFICABLE | Igual que arriba |
| SUPABASE_SERVICE_ROLE_KEY | NO VERIFICABLE | No listable; en Lovable Cloud es un valor reservado inyectado, no consultable |
| LOVABLE_API_KEY | PRESENTE en el almacén de secretos del proyecto (gestionado), sin confirmación específica del proceso publicado | Listado de secretos del proyecto (nombres, sin valores) |

Secretos del proyecto visibles (solo nombres): CRON_SECRET, LOVABLE_API_KEY, SENTRY_AUTH_TOKEN.
Las tres variables SUPABASE_* no aparecen en ese listado por diseño: el prefijo es reservado y lo inyecta la plataforma; su listado no es equivalente a evidencia del runtime publicado.

Dónde lo debe comprobar el usuario: Configuración del proyecto → Secretos (nombres) y, para el runtime real de producción, el registro de una petición de servidor ya desplegada (por ejemplo, un error de "Missing Supabase environment variable(s)" en Sentry o en los registros del hosting). No se agregó ningún endpoint de diagnóstico.

## 2. Auth: Site URL y lista de redirecciones

NO VERIFICABLE. Las herramientas disponibles de Auth solo permiten escritura de un subconjunto (registro, confirmación, HIBP, límite de correos) y ninguna devuelve Site URL ni la allowlist de redirecciones. No se probó enviando un correo de recuperación.

Dónde lo debe comprobar el usuario: Configuración de autenticación del backend (URL del sitio y URLs de redirección permitidas). Debe existir `https://liftgo.lovable.app` como Site URL y una entrada que autorice `https://liftgo.lovable.app/auth` (exacta o comodín equivalente), porque tanto `resetPassword` como la invitación al portal redirigen a `${origin}/auth`.

## 3. Despliegue publicado y punto de rollback

- Publicado: sí. Visibilidad: pública. URL: https://liftgo.lovable.app
- Commit/snapshot realmente desplegado: NO VERIFICABLE. Ninguna herramienta disponible expone el SHA ni el identificador del despliegue servido, y no se infiere desde HEAD, la vista previa ni `version.json` (que solo indica 8.1.0 generado en el sandbox).
- Despliegue anterior utilizable como rollback: NO VERIFICABLE por la misma razón.

Dónde lo debe comprobar el usuario: diálogo de Publicación / historial de versiones del proyecto, donde figura el despliegue activo y las versiones previas restaurables.

## Acciones manuales mínimas antes del release

1. Confirmar en la configuración de autenticación que `https://liftgo.lovable.app/auth` está autorizado como redirección.
2. Anotar el despliegue activo actual desde el historial de publicación como punto de rollback antes de publicar el candidato.
3. Tras publicar, verificar que `https://liftgo.lovable.app/version.json` reporte la versión esperada.
