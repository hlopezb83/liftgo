## Diagnóstico

Este reporte (`requestId: 42c2055d…`, timestamp `2026-07-02T16:34:15.073Z`) es la causa raíz del toast "No se pudo cargar el historial de cambios" que revisamos hace unos minutos: un `SyntaxError` de `JSON.parse` en `public/changelog.json`, línea 31, columna 55.

El origen era una comilla sin escapar dentro de la descripción de la entrada v6.106.0:

```json
"description": "Nueva sección \nIdentificadores" en el detalle (…)"
```

La `"` después de `Identificadores` cerraba el string prematuramente y rompía todo el archivo, por eso `fetchChangelogIndex` fallaba en `res.json()` desde cualquier ruta (incluyendo `/invoices/:id`).

## Estado

Ya se corrigió en la versión anterior:

- `public/changelog.json` → línea 31 escapada (v6.106.0 ahora usa comillas simples internas).
- Entrada de changelog `v6.106.4` publicada documentando el fix.
- Validado con `json.load`: 209 entradas parsean correctamente.

Ambos reportes (`63554943…` que ya trabajamos y `42c2055d…` de este mensaje) comparten el mismo timestamp `16:34:15` y son la misma sesión del error — se emitieron antes del deploy del fix.

## Plan

**No se requieren cambios adicionales.** Basta con que recargues la página (Ctrl+F5 para forzar el bypass del cache del `changelog.json`) y el toast dejará de aparecer.

Si al recargar sigue apareciendo el error, avísame con un nuevo `requestId` posterior a esta hora y lo investigo como un caso distinto (posible cache del CDN o una entrada nueva que rompa el JSON).
