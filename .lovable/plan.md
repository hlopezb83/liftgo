## Problema

El botón "Copiar reporte" en el modal de Detalles de error dispara "No se pudo copiar el reporte". La causa es que `navigator.clipboard.writeText()` falla en contextos donde el Clipboard API no está disponible o está bloqueado por Permissions-Policy (típico dentro de iframes de preview, o navegadores sin permiso otorgado). Actualmente el `catch` sólo muestra un toast rojo, sin plan B.

## Solución

Agregar un fallback robusto de copiado en `src/components/ui/ErrorDetailsDialog.tsx`:

1. Intentar primero `navigator.clipboard.writeText(text)` si `navigator.clipboard` existe y `window.isSecureContext` es true.
2. Si falla o no está disponible, usar fallback clásico: crear un `<textarea>` off-screen, seleccionar y `document.execCommand('copy')`.
3. Sólo si ambos fallan, mostrar el toast de error (con mensaje más útil sugiriendo seleccionar el texto manualmente).

Sin cambios de UI ni de comportamiento en el caso feliz. No se toca lógica de negocio.

## Cambios

- `src/components/ui/ErrorDetailsDialog.tsx`: extraer `handleCopy` a helper `copyToClipboard(text)` con fallback `execCommand`.
- `public/changelog.json` + `public/changelog/v6.110.6.json`: entrada patch documentando el fix.
