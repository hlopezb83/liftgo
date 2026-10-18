# Roadmap operativo y estado de evidencia

## V08: detalle de equipo (18 de octubre de 2026)

- [x] Base `ed289dbfe4b530e35a9ef3945f523e45c2f9f9ff` y referencias local/remota `fix/ui-v08-equipment-layout-20261018` confirmadas; checkout interno `edit/*`, limpio al inicio.
- [x] Seguro nativo desplegable según campos visibles (cero válido), omisión de adquisición no autorizada y resumen financiero antes de Notas, fuera del grid; métricas, tarifas y controles intactos.
- [x] Vitest focal 22/22 en cuatro archivos: seguro vacío/parcial/completo/cero/costos ocultos/cambio de visibilidad, ubicación, orden del resumen y gates independientes. ESLint en cuatro archivos sin errores/advertencias; diff-check limpio. `public/version.json` idéntico a base.
- [ ] GUI geométrica a 375/1440 pendiente: Chromium aislado con tarjetas reales y datos ficticios verificó a 375 apertura/cierre por Enter/Espacio/clic, estado inicial y costo cero. El host temporal no aplicó utilidades Tailwind correctamente (sin espacios ni ruptura efectiva), por lo que sus medidas no validan el layout de la aplicación y 1440 no se completó. No equivale a QA autenticada/publicada. Capturas válidas no disponibles; scripts en `/tmp/browser/v08/`.
- [ ] Coordinador: build productivo y typechecks/CI pendientes; no se ejecutan manualmente por restricción del entorno ni prebuild que regenere versión. Logs automáticos `build OK` no sustituyen esas comprobaciones. Sin lecturas/mutaciones ERP, versión/changelog ni publicación.
- Riesgo previo documentado antes de implementar: `useForkliftFinancials` usa clave por equipo sin rol y `enabled: false` no elimina datos ya cacheados; `ForkliftDetail` sigue pasándolos a la tarjeta. `useUserRole` también conserva rol en caché. Un cambio de rol en caliente podría mantener información anterior. V08 no modifica este comportamiento ni unifica los dos gates; requiere revisión separada de permisos/caché.

## V06: inspector bancario (18 de octubre de 2026)

- [x] P2 PR268: referencias local/remota `fix/ui-v06-bank-inspector-20261018` en `da1b747150340809b3f35ff00c5f19dd83d7e1a5` confirmadas antes de editar. Cierre resuelve fila montada visible o región accesible del listado vigente; sin BODY, nodos antiguos, temporizadores ni cambios de scroll/API compartida.
- [x] P2: 14/14 pruebas focales Workspace y candidatos, con tabla/virtualizador/Radix reales y hooks aislados: 120 filas, J de línea 0 a 40 ausente del DOM, cierre al listado, selección/scroll conservados; eliminación por refresh, filtro y lista vacía, sin enfocar fila desconectada. Cero llamadas mutantes; ESLint en dos archivos y diff sin errores. Enter de VirtualBody preexistente no se atribuye a regresión ni se modifica.
- [x] P2: `public/version.json` restaurado exactamente a base `694b2bd9` (generatedAt `2026-10-18T01:01:19.886Z`), sin versionar ni changelog.
- [ ] P2: nueva QA de navegador no ejecutada; jsdom comprueba foco/DOM, no geometría. Build productivo y typechecks manuales no ejecutados por restricción del entorno; CI y QA publicada pendientes del coordinador. Logs automáticos no sustituyen estas comprobaciones.
- [x] Base `694b2bd9b77010f0d608407af86a46f46c4a620f` y referencias local/remota `fix/ui-v06-bank-inspector-20261018` confirmadas; checkout interno `edit/*`. `public/version.json` estaba modificado al inicio de V06; restaurado en P2 por indicación del coordinador.
- [x] Tabla única a ancho completo, inspector Sheet independiente del viewport y retorno de foco a fila vigente al cerrar; descripción/referencia acotadas con texto íntegro en title. Panel, candidatos, hooks y mutaciones intactos.
- [x] Vitest focal 13/13 en tres archivos: Workspace/Radix/tabla/panel/candidatos reales con hooks ficticios, clic/Enter, J/K/flechas, escritura, Escape/X/ciclos, filtros, selección/barra/razón/orden/scroll/resize y virtualización real de 120 líneas; cero llamadas mutantes. ESLint en tres archivos y diff sin errores.
- [x] Chromium aislado con componentes reales y hooks ficticios fuera del proyecto: listado 1046px a 1366 y 1120px a 1440, mismo ancho del workspace; Fecha/Importe/Estado dentro del encuadre inicial. A 375 listado 343px con scroll horizontal interno, sin overflow de página; inspector visible, candidatos, navegación y cierre tras resize regresan a fila vigente, cero mutaciones/errores. Capturas y medidas `/tmp/browser/v06/`; no equivale a QA autenticada/publicada.
- [ ] Coordinador: build productivo y ambos typechecks/CI pendientes; ejecución manual no permitida. Log automático `build OK` del 2026-10-18T10:32:58Z, no certifica build productivo ni CI. No se ejecutó e2e bancario ni se cambió datos, versiones/changelog o publicación. SDK, permisos y lógica intactos.

## KPI móvil: etiquetas completas (18 de octubre de 2026)

- [x] Base `2d38f5eaa153db042749b1da845fe56a5ee31f66` confirmada; checkout interno `edit/*`, correspondiente a la referencia seleccionada por el coordinador.
- [x] Sólo Resultados: grid 1/2/3/5 columnas y etiquetas sin clamp; KpiTile: sólo etiqueta sin clamp y ruptura de emergencia. Valores, cálculos, interacción y otros grids intactos.
- [x] Vitest: 54/54 en ocho archivos (KpiTile, cinco etiquetas/importes exactos de Resultados, comparativo sin KPI, derivados del reporte y MRR); ESLint de cuatro archivos y diff sin errores.
- [x] Chromium aislado, componentes KPI reales y hook ficticio fuera del proyecto: a 375/640/1024/1440, sin recortes ni overflow; valores alineados por fila en Resultados, StatCards y MrrKpiCluster. A 375 los cinco valores habituales de Resultados quedan en una línea. Capturas/medidas en `/tmp/browser/kpi-mobile/`; sin errores de página ni lecturas ERP.
- [ ] Límite observado al 200% (simulado duplicando tamaño raíz, también escala espacios; no equivale al zoom de sólo texto del navegador): Resultados muestra etiquetas completas, pero con 3+ líneas pierde alineación a 640/1024/1440 (desfases máximos 105/70/175 px); StatCards/MRR tienen overflow a 375 y contenido sin ancho disponible en algunas celdas a 1024. Reportado antes de ampliar alcance; grids ajenos y valores no se modifican. QA autenticada/publicada pendiente.
- [ ] Coordinador: build productivo y typechecks en CI; ejecución manual no permitida por el entorno. No equivale a QA autenticada/publicada; sin datos, versiones, changelog ni publicación.

## V04–V05: presentación KPI (Resultados, Conciliación, KpiTile)

- [x] Base `553448234aa75001d64788cfd6380089f0ffae10` confirmada; checkout interno `edit/*`.
- [x] V04 Resultados: grid 2/3/5 columnas (5 sólo desde xl), etiqueta con zona reservada de 2 líneas, valor sin `truncate` con ruptura de emergencia y `tabular-nums`; contenido, colores y condición `!isComparison` intactos.
- [x] V04 Conciliación CFDI: zona reservada de etiqueta para alinear valores; sin cambios de datos ni copy.
- [x] V05 KpiTile: escala por `valueSize`+longitud (sm: ≤10 text-lg, 11-12 text-base, 13+ text-sm; lg: ≤10 text-2xl, 11-12 text-xl, 13-14 text-lg, 15+ text-base); `123` y `"123"` iguales; ReactNode no se convierte; helper global `kpiSizeClass` sin tocar.
- [x] Pruebas: 12/12 nuevas de KpiTile (límites 10/11/12/13/14/15, 0/negativos/porcentajes/importes largos/ReactNode, etiquetas 1/2 líneas, href/onClick/foco) + 4/4 regresión kpiSizeClass + 101/101 dashboard/portal + 496/496 facturas/reportes. ESLint de 4 archivos limpio; `tsc --noEmit` sin errores; arch-check OK.
- [ ] Coordinador: build productivo y QA real a 375/640/1024/1440 y texto 200% pendientes; jsdom no demuestra geometría. Sin publicación, versionado ni changelog.

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
