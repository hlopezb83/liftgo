# Roadmap operativo y estado de evidencia

## V02: regreso de foco desde Historial y Exportar

- [x] Base `d949eded179bdd8c9adf29b13af16ec453fb4db5` y referencia `fix/ui-v02-history-focus-20261018` coinciden; checkout interno `edit/*`.
- [x] Restauración opt-in al desmontar el diálogo hacia el botón actual Más acciones, sólo conectado, habilitado y visible; sin temporizadores ni cambios de permisos/negocio/estilo.
- [x] 37/37 pruebas focales en cinco archivos: Radix/FormDialog reales, Escape/Cerrar/X, ciclos, ref remontado, destino ausente/no disponible, bloqueo ocupado y cancelación de exportación sin operación; lint sin errores, diff sin errores de espacios.
- [x] Chromium autenticado, sólo lectura: Historial abierto por teclado, foco dentro y restauración a Más acciones tras Escape/Cerrar/X; captura en `/tmp/browser/v02-history-focus/closed.png`. No equivale a QA publicada ni a validación real de resize/exportación (cubiertos por integración).
- [ ] Coordinador: build productivo y typechecks en CI; no se ejecutan manualmente en este entorno. QA publicada pendiente; sin publicar, versionar ni migrar.

## V02–V03: acciones de proveedor y filtros de facturas

- [x] Confirmar base `58f7b4a79a206724530c30616076951f99e6cca6` y referencias de `fix/ui-v02-v03-headers-filters-20261018` (checkout interno `edit/*`).
- [x] Agrupar acciones secundarias de proveedor en Más acciones, con liberación separada; conservar permisos, rutas, callbacks y Nueva factura primaria.
- [x] Separar búsqueda visible de las facetas de facturas; filas locales y facetas alineadas abajo, sin alterar filtros ni paginación.
- [x] Vitest focal: 42/42 en seis archivos (permisos, callbacks únicos, teclado/Escape/foco, búsqueda única, conservación al cerrar/reabrir/cambiar tamaño y otro listado sin opt-in). ESLint de diez archivos sin advertencias; diff sin errores de espacios.
- [ ] Build y ambos typechecks manuales no permitidos por este entorno; el log automático no certifica build productivo ni CI.
- [ ] Coordinador: QA real a 1366/1440/375 y CI del SHA final; sin publicación, fusión ni cambios de versión/changelog.

## V01: contraste focal de acceso y alertas

- [x] Confirmar base `567b397e9271139216ed90e2d77d5d66144d30b1` y referencias de `fix/ui-v01-contrast-20261018`.
- [x] Ajustar sólo primary/ring de `.auth-brandscape` y texto/icono de Alert warning.
- [x] Pruebas focales: 20/20 en cuatro archivos; diff sin errores de espacios.
- [x] Chromium: acceso empleado/plataforma y recuperación, normal/hover/foco con tema claro y .dark heredado; CTA 6.85:1, hover compuesto 5.40:1, anillo 6.85:1 sobre blanco y 6.40:1 sobre fondo auth. Geometría y PortalLogin comparados con captura previa, sin cambios; móvil sin desbordamiento y sin errores de página.
- [x] Alert real en host aislado del navegador: texto e icono 5.63:1 sobre fondo claro y 10.98:1 en oscuro. No equivale a QA autenticada de Resultados.
- [ ] Coordinador: build/typechecks manuales no permitidos en este entorno; sólo log automático `build OK` del 2026-10-18T02:49:19Z, no certifica build productivo ni CI. QA autenticada de Resultados pendiente (sesión no inyectada); sin publicación ni fusión.

Límite fuera de V01: la captura con .dark heredado conserva el problema previo de encabezados/etiquetas claros sobre tarjeta blanca; no se alteran foreground/card-foreground, ya que la autorización permite sólo primary/ring locales.

## PR261: corrección focal Sentry 11.7.0

- [x] Confirmar HEAD y referencias de PR261 antes de editar.
- [x] Comparar versiones reales del SDK contra las declaradas, conservando las aserciones de privacidad e identidad.
- [x] Actualizar documentación vigente sin alterar evidencia histórica, Deno ni changelog.
- [x] Ejecutar pruebas focales: 51 casos; arranque local HTTP 200, interacción y recarga sin errores de página.
- [ ] Coordinador: confirmar build, smoke productivo y Gate A/B en CI del SHA final; el entorno no permite build/typechecks manuales.

Revisado el 29 de septiembre de 2026 contra el repositorio `main`.

## Estado comprobable

- `main` apunta al commit
  [a21b527](https://github.com/hlopezb83/liftgo/commit/a21b527ffce794bf7fe019fec31b14ac7d5c22b2).
- CI principal pasó en el run
  [36614039590](https://github.com/hlopezb83/liftgo/actions/runs/36614039590) y
  Gitleaks pasó en el run
  [36614039561](https://github.com/hlopezb83/liftgo/actions/runs/36614039561),
  ambos sobre ese commit.
- CI reparte Vitest en cuatro shards. El smoke de arranque y la suite E2E
  completa son carriles distintos.
- El propietario confirmó que existe una segunda organización de prueba en
  Lovable Cloud. Git no puede confirmar sus usuarios, datos ni configuración.
- El ensayo A/B versionado pasó en el commit
  [c4a6b69](https://github.com/hlopezb83/liftgo/commit/c4a6b69ccb4fe0561d3660c2603b637336ec631f)
  el 21 de septiembre. Esa evidencia no certifica commits posteriores ni
  producción.

## Siguientes pasos recomendados

### 1. Confirmar el estado de Lovable Cloud

Con lecturas fechadas y sin inferirlo del código, verificar el ledger aplicado,
las organizaciones y membresías, la configuración de Storage y las llaves
fiscales que correspondan. Registra sólo resultados necesarios, sin secretos,
datos personales ni tokens. Sigue [Política de migraciones](docs/migrations.md)
y [Estado multiempresa](docs/multiempresa/onboarding.md).

### 2. Repetir el ensayo A/B para el código actual

Ejecuta `multi-tenant-ab.yml` en la versión que se pretende liberar y guarda la
evidencia de aislamiento de consultas, escrituras, Storage y portal. El
resultado histórico de `c4a6b69` no sustituye el resultado del commit actual.
Usa exclusivamente el backend local efímero protegido por el workflow.

### 3. Ensayar recuperación en un entorno aislado

Documenta una restauración de base y Storage en un proyecto aislado, con
verificación posterior de integridad. No uses la restauración del proyecto
productivo como ensayo. Git no contiene evidencia de una restauración completa
ya realizada; confirma el estado real con el equipo que administra Lovable Cloud.

### 4. Completar validación funcional por organización

Prueba los flujos con usuarios y permisos representativos: clientes,
cotizaciones, reservas, documentos, inventario, pagos, portal y configuración
fiscal de sandbox. Comprueba que la marca LiftGo sea igual en todas y que razón
social, folios, tarifas, stock y llaves fiscales sigan siendo propios de cada
organización. Registra hallazgos reproducibles sin usar datos productivos como
fixtures.

### 5. Formalizar controles de publicación

GitHub no exige actualmente los checks de CI como protección de rama, según la
revisión documentada. Configura checks requeridos y revisa la protección de
`main` como mejora operativa para el flujo rutinario de publicación.

### 6. Cerrar gobierno de datos globales

Mantén el catálogo compartido LiftGo limitado a maestros aprobados. Define
propietario, permisos de edición, revisión y política de retirada para modelos,
SKUs y plantillas legales. No compartas precios de renta, inventario disponible,
clientes, contabilidad ni credenciales entre organizaciones salvo decisión de
producto expresa.

## Criterio para declarar un entorno listo

No declares un entorno multiempresa listo basándote sólo en código, un build o
un ensayo histórico. Incluye el SHA probado, CI vigente, ledger de Lovable
Cloud, ensayo A/B, resultados de operación entre usuarios y evidencia de
recuperación aislada. Confirma los datos de producción directamente en Lovable
Cloud en el momento de la decisión.
