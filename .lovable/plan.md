# Fix — changelog.json corrupto rompe la app

## Diagnóstico confirmado

`public/changelog.json` no parsea. El entry `7.128.0` perdió su llave de apertura `{`. Entre el cierre del entry `7.129.0` (línea 71) y el `"version": "7.128.0"` (línea 73) hay una línea en blanco donde debería estar el `{`. Por eso el fetch del changelog revienta con `SyntaxError` y truena la ruta `/`.

```text
71:   },
72:              ← aquí falta "{"
73:     "version": "7.128.0",
```

## Cambio

Reemplazar la línea 72 (vacía) por `  {` para restablecer la estructura de objeto del entry 7.128.0. No se toca ningún otro contenido.

## Verificación

- `python3 -c "import json; json.load(open('public/changelog.json'))"` debe salir sin error.
- Recargar `/` en el preview: la app monta sin `SyntaxError`.

## Changelog

Agregar entrada `7.132.1` (patch) en `public/changelog.json` + `public/changelog/v7.132.1.json` documentando el fix del JSON.
