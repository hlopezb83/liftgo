# Consulta Node 26 en Lovable (sólo lectura, sin cambios)

## Observado en este proyecto (sandbox de preview, 2026-10-30)
- `node -v` → **v22.23.4** (`/bin/node`).
- `bun -v` → **1.4.4** (`/bin/bun`).
- El repo ya fija `.node-version` y `.nvmrc` = `24.22.1` y `engines.node = "24.22.1"`, `engines.bun = "1.4.4"`, `packageManager = bun@1.4.4`.
- Aun así el sandbox corre Node 22: **los pins de Node no se respetan** en el preview. Ningún log muestra aviso o error de `engines`; el último build dice `build OK`.
- Bun 1.4.4 coincide con el pin, pero no hay evidencia de que sea por el pin y no por la imagen base.

## No observable
- Versión de Node/Bun del build de **publicación**: no hay logs accesibles de ese pipeline.
- Documentación de Lovable consultada: no encontró nada sobre selección de Node ni `engines`.

## Inferencia (no confirmada)
- Como hoy `engines.node = 24.22.1` con Node 22 real no rompe el preview, Bun no hace cumplir `engines.node`; un `>=26` o pin 26 probablemente tampoco bloquearía el preview, pero **seguiría corriendo Node 22**.
- No hay evidencia de que Node 26 pueda seleccionarse en Lovable. El riesgo real sería código o scripts (`scripts/*.mjs`, Vite) que usen APIs exclusivas de Node 26: fallarían en Node 22.
- La publicación no está verificada; podría tener otro comportamiento.

## Recomendación para la rama
- Pinear 26 sólo en CI (`actions/setup-node`), sin depender de que Lovable lo cumpla.
- Mantener los scripts de build compatibles con Node 22 (no usar APIs exclusivas de 26 en `prebuild`/`gen-version`).
- `@types/node` 26 sólo afecta tipos; vigilar que los tipos no oculten APIs que faltan en Node 22.
- Validar con un build de publicación de prueba antes de fusionar.
