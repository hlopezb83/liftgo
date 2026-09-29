# Roadmap operativo y estado de evidencia

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
