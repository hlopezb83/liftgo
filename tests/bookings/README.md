# Revisión visual local de reservas

Este harness sirve el build real en `http://127.0.0.1:4186` con fixtures
sintéticos. No inicia sesión en LiftGO remoto, crea reservas, confirma
extensiones ni envía otras mutaciones. No está conectado automáticamente a CI.
Coordina el turno de build/navegador antes de ejecutarlo en una máquina compartida.

Ejecuta los comandos desde la raíz del checkout aislado. Debe tener las
dependencias del lockfile y Chrome/Chromium local disponibles. La configuración
usa el navegador administrado por Playwright; puedes indicar una instalación
existente en `SMOKE_CHROMIUM_PATH` sin descargar navegadores.

## Build con backend ficticio

Comprueba sólo la ausencia de archivos locales de entorno, sin leer ni mostrar
su contenido. Si aparece alguno, prepara otro checkout aislado sin copiarlo.

```powershell
if (@('.env', '.env.local', '.env.production', '.env.production.local', '.dev.vars') | Where-Object { Test-Path -LiteralPath $_ }) {
  throw 'Este harness requiere un checkout aislado sin archivos de entorno locales.'
}
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:SUPABASE_URL = 'http://127.0.0.1:54321'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'smoke-placeholder-key'
$env:SUPABASE_PUBLISHABLE_KEY = 'smoke-placeholder-key'
$env:VITE_SUPABASE_PROJECT_ID = 'smoke-placeholder'
$env:SUPABASE_PROJECT_ID = 'smoke-placeholder'
$env:SENTRY_DSN = 'http://public@127.0.0.1:54321/1'
$env:WRANGLER_SEND_METRICS = 'false'
Remove-Item Env:SENTRY_AUTH_TOKEN -ErrorAction SilentlyContinue
node scripts/gen-version.mjs
node node_modules/vite/bin/vite.js build
```

El build puede regenerar manifiestos de versión o el árbol de rutas. Revísalos
por separado; no son cambios necesarios del harness. No heredes variables de
despliegue, credenciales de producción ni archivos `.dev.vars` al servidor local.

## Tipos y ejecución coordinada

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/bookings/tsconfig.json
$env:SMOKE_REUSE_BUILD = '1'
node node_modules/@playwright/test/cli.js test --config tests/bookings/playwright.config.ts --workers=1
```

La configuración nunca compila implícitamente. El guard importado de smoke
exige un artefacto con destino ficticio y rechaza referencias conocidas del
backend productivo. Inicia su propio servidor local y no reutiliza otro proceso.
Para una revisión focalizada puede añadirse `--project mobile-390` o `--grep`
al último comando. Las capturas PNG y los registros de red/geometría se guardan
en `../booking-evidence` respecto de la raíz del checkout; se puede cambiar
con `BOOKINGS_EVIDENCE_DIR` a otro directorio local autorizado. No se suben a Library.

## Barrera de red

- Identidad y organización ficticias, válidas sólo en el origen local del test.
- Dos server functions GET enumeradas: contexto de organización y estado de
  operador de plataforma; se resuelven sus IDs del build exacto.
- Tablas REST GET enumeradas; no hay wildcard de tablas ni respuestas vacías
  para lecturas desconocidas.
- RPC de lectura enumeradas: nombre de organización, branding, badges y
  disponibilidad. La última valida sus dos parámetros de fechas antes de responder.
- Autenticación de red limitada al GET sintético de usuario; no login ni refresh.
- Toda mutación, server function inesperada, red externa y websocket se bloquea.
  Un intento inesperado hace fallar el caso. Las fuentes y telemetría externas
  abortadas se registran; no se afirma fidelidad de tipografía remota.

## Cobertura y límites

Los proyectos usan 360×800, 390×800 y 1440×1000. Cubren nombres largos,
resumen de equipo/periodo/estado, estados completado/cancelado, permiso de sólo
lectura, permiso operativo completo con importes stale deliberados, estimación
MXN/USD, recurrencia mensual, cierres Escape/Cancelar/X y retorno de foco.
Nueva reserva se llena sin enviar; comprueba resumen, acción única, sticky,
borrador y el flujo interno lista → Nueva reserva → cambio → Cancelar/Volver →
confirmación de salida → lista, sin enviar la reserva.

El caso de teclado verifica que enfocar un input móvil deja el panel de acciones
en flujo normal y repite la comprobación con altura de viewport 420. Esto cubre
foco y altura reducida; no abre ni certifica un teclado nativo Android/iOS.
El caso de reflow reduce 1440×1000 a 720×500: simula el espacio de layout que
habría al ampliar a 200%, pero no aplica zoom nativo del navegador, pinch zoom
ni escalado de texto del sistema. Registra esa simulación explícitamente.

Las capturas son de viewport, con geometría y cero desbordamiento horizontal
exigido. No prueban guardado real, RPC de escritura, RLS/backend, datos reales,
entregas posteriores, timbrado ni facturación emitida.
