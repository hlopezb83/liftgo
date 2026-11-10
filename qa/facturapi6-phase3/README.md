# Fase 3 — Sandbox ELOGISTIX: preparación para revisión

Fecha: 10/11/2026. **No ejecutada, no activada, no desplegada.**

Esta carpeta contiene el plan, datos propuestos sin IDs reales, comprobaciones locales y una copia parcial de adaptación offline. No contiene ejecutor, pantalla, endpoint, SQL ni instrucciones de invocación. No se conecta al proveedor ni a la base. No copiar el runner anterior a una nueva Edge Function: esa ruta está prohibida.

## Alcance autorizado

- ELOGISTIX SHIPPING / Empresa Prueba, tenant fijo `fc2c10e3-278b-4899-8aa1-f802752f1c38`, exclusivamente modo `test`.
- Dos facturas, un REP y una nota de crédito: máximo **4 CFDI**, **116 MXN por documento**, cantidad **1** en cada partida aplicable.
- Pausar reintentos y reconciliación globales sólo durante la futura ventana, y restablecer su estado anterior al cerrar. No se pausaron ahora.
- Preparación actual solamente. La ejecución requiere revisión independiente del paquete ejecutable y de la ventana; no abrir fechas por anticipado.

## Archivos

- `TEST_PLAN.md`: secuencia, criterios de aceptación, bloqueos y cierre.
- `fixtures.json`: propuesta de importes y relaciones; **no es payload fiscal ni datos para importar**. No contiene RFC, códigos SAT, llaves, usuario, cliente ni IDs ERP/PAC reales.
- `test_plan.py`: pruebas locales de esos límites y relaciones, sin paquetes externos ni conexiones.
- `MANIFEST.json`: SHA-256 de los archivos anteriores para identificar la revisión; no certifica ejecución.
- `ADAPTATION_REVIEW.md`: cierre de arquitectura, matriz de paridad y bloqueos concretos antes de crear un ejecutor.
- `audit_imports.py` / `IMPORT_AUDIT.json`: inventario estático local con digests y líneas; no carga TypeScript ni consulta servicios.
- `test_audit_imports.py`: pruebas del inventario con archivos ficticios; no sustituye pruebas de handlers.
- `adaptation/`: copia rastreable de seis handlers auténticos, resolver sólo test y 23 pruebas focales; transporte bloqueado explícitamente. Ver su README para la decisión pendiente, diferencias y límites de evidencia.

## Evidencia anterior y límites

Fase 1 está preparada como parche, no instalada: `../facturapi6-phase1/`. Fase 2 reporta 13/13 operaciones de la **capa SDK** idénticas con transporte simulado. Su sonda no compara por sí sola todos los handlers ni todas sus secuencias de persistencia ERP; las suites históricas tampoco sustituyen esa evidencia.

El preflight anterior tuvo una única lectura observada por el usuario y quedó cerrado; `src/lib/qa/facturapi6-preview/policy.ts` permanece `enabled=false`, `shutdown=true`. No reutilizar su run ni extender sus fechas. Eso validó SDK 6/emisor en Preview, **no runtime Deno ni flujo fiscal integral**.

Los archivos operativos, SQL aprobado de exclusividad, dependencias y permisos no se modificaron. La función booleana de exclusividad continúa sin invocador activo; no se ejecuta recuperación SQL.

## Antes de ejecutar

Hay bloqueos de arquitectura, no ausencia de autorización de fixtures: deben resolverse según `TEST_PLAN.md`. La revisión de este documento **no activa** una prueba. Una futura ejecución sandbox escribirá fixtures, estados y archivos en la base compartida con producción, aunque los CFDI sean de prueba. Las pruebas automatizadas con escritura sólo usarán un entorno efímero, nunca esa base compartida.

Validación de esta preparación: `python3 -m unittest discover -s qa/facturapi6-phase3 -p 'test_plan.py' -v`. No ejecutar el runner antiguo.

Continuación 10/11/2026: 14/14 comprobaciones locales (10 de fixtures y 4 del inventario). `python3 -B -m unittest discover -s qa/facturapi6-phase3 -p 'test_*.py' -v`. Inventario: 46 archivos, sin imports relativos faltantes; lectura livekey de la capa candidata y exclusión durable entre etapas siguen siendo bloqueos, no soluciones implementadas. CI completo y paridad de handlers pendientes. No cambió código operativo, preflight, SQL, dependencias ni datos.