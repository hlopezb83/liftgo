## Contexto

El workflow de CI **Detectar secretos** (gitleaks 8.24.3) está fallando con **1 leak detectado**. El hallazgo es un **falso positivo**:

- **Regla:** `generic-api-key` (entropía 3.66)
- **Archivo:** `supabase/migrations/20260718065420_51b1d80a-c8ac-4599-90d6-bd332b10228d.sql`, línea 2
- **Contenido real:** un **UUID de usuario** (`3e2d6f9d-aa74-4a70-b1d2-0c11a1cd1019`) usado en un `DELETE FROM auth.users WHERE id = '...'` para limpiar un usuario huérfano.

Un UUID de `auth.users` no es un secreto: no otorga acceso, no es una API key y ya está en el historial de git (commit `515c288`). Bloquear el pipeline por esto es ruido.

## Cambios propuestos

**Archivo único:** `.gitleaksignore`

Agregar el fingerprint exacto reportado por gitleaks al final del archivo, con un comentario que explique por qué se ignora:

```
# UUID de auth.users en migración de limpieza — no es una API key.
515c288f6bf1f63c72375fbb3a60c0db303c4411:supabase/migrations/20260718065420_51b1d80a-c8ac-4599-90d6-bd332b10228d.sql:generic-api-key:2
```

El fingerprint incluye el commit SHA, por lo que sólo silencia **esa línea en ese commit** — cualquier secreto nuevo o cualquier otro UUID en otra migración seguirá siendo detectado.

## Por qué esta opción y no otras

- **No modificar la migración:** ya está aplicada en Cloud e inmutable en historia; reescribirla no eliminaría el hallazgo (gitleaks escanea `--all`).
- **No ampliar `.gitleaks.toml` con un allowlist genérico de UUIDs:** demasiado permisivo, podría enmascarar futuras fugas.
- **`.gitleaksignore` con fingerprint específico** es el mecanismo oficial recomendado por gitleaks para falsos positivos puntuales.

## Verificación

Después del merge, el próximo run del workflow `Detectar secretos` debe salir con `leaks found: 0` y exit code 0.

## Changelog

Nueva entrada patch **v7.119.1** en `public/changelog.json` + detalle en `public/changelog/v7.119.1.json` documentando el silenciado del falso positivo.
