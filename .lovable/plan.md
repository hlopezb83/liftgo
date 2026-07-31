# Ronda 8 — Auditoría GUI: 3 migraciones + 19 paquetes de frontend

## Validación previa (hecha, no supuesta)

Tres auditores contrastaron los 22 paquetes contra el código y la base reales: **22/22 vigentes, 0 falsos positivos, 0 ya aplicados**. Además consulté la base en vivo:

- Las 3 políticas RLS que el documento dice huérfanas: **0 existen hoy** (confirmado en `pg_policies`).
- Trigger de cierre de OT: **no existe** ninguno.
- Cron `mark-overdue-supplier-bills-daily`: **activo**.
- Órdenes de trabajo abiertas con daño abierto que el nuevo trigger rechazaría: **0** — se puede aplicar sin romper nada existente.

Dos precisiones frente al documento: `rejection_reason` **ya existe** en cotizaciones (R8-FE-15 es sólo frontend), y en R8-FE-14 el cobro ya es inclusivo (`addDays(end,1)`), así que mostrar 11 días en vez de 10 **corrige** una discrepancia entre lo mostrado y lo cobrado.

## Fase 1 — Base de datos (3 migraciones, en orden)

1. **R8-DB-01** — Recrear las políticas de lectura perdidas: mecánico vuelve a ver reservas y extensiones (hoy la flota le dice "Sin reservas aún" en falso); ventas vuelve a ver el historial de prospectos, pero **acotado a prospectos** para no reabrir el hueco de datos personales que motivó el borrado original.
2. **R8-DB-02** — Candado en el servidor: no se puede cerrar una orden de trabajo con daños abiertos. La pantalla ya lo promete pero nadie lo hacía cumplir.
3. **R8-DB-03** — Diagnóstico de coherencia en cuentas por pagar; el saneo sólo corre si se activa a mano. No toca datos en producción.

## Fase 2 — Frontend P1 (6 paquetes)

- **FE-01** Tab "Vencido" de facturas: incluye estado `overdue` y excluye canceladas, para que coincida con el panel.
- **FE-02** Detalle de unidad: el dato financiero se pide sólo si el rol puede verlo (adiós toast de error para el mecánico).
- **FE-03** "Cerrar OT": el botón se deshabilita con daño abierto, en línea con el nuevo candado del servidor.
- **FE-04** Editar cotización: esperar a que los datos estén listos antes de precargar, para que las líneas no se pierdan al navegar lista → detalle → editar.
- **FE-05** Avisos en móvil con `mobileOffset` para que no tapen el encabezado (regresión pendiente de la ronda 7).
- **FE-06** Historial de prospecto: "no tienes permiso" en vez de "sin cambios" cuando el rol no puede leer.

## Fase 3 — Frontend P2 (13 paquetes)

FE-07 KPIs de CxP (borradores fuera de "Vencido", pagadas fuera de "Por aprobar") · FE-08 fechas del portal de contratos · FE-09 área táctil de switch y checkbox · FE-10 botones de iconos en facturas · FE-11 contraste de insignias de éxito · FE-12 bitácora sin inglés crudo y sin cortar identificadores · FE-13 área táctil de la barra de antigüedad · FE-14 duración inclusiva en cotización · FE-15 diálogo de motivo al rechazar cotización · FE-16 fecha de inspección en zona horaria de Monterrey · FE-17 insignia de solo lectura para roles no internos en Usuarios · FE-18 estado fiscal traducido en conciliación · FE-19 método de pago traducido en el historial.

## Pruebas

Pruebas unitarias nuevas para la lógica con reglas: filtro de vencidas (FE-01), gate por rol (FE-02), bloqueo de cierre con daño (FE-03), KPIs de CxP (FE-07), duración inclusiva (FE-14) y los mapeos de traducción (FE-12/18/19). Al final: typecheck, lint y la suite completa.

## Notas técnicas

- Migraciones `20260801000100/000200/000300`, aplicadas en ese orden; todas idempotentes.
- El trigger usa la exención `app.e2e_seed='on'` ya usada en el repo, para no romper el sembrado de pruebas E2E.
- FE-14 cambia números visibles en cotizaciones (10 → 11 días); se alinea con el cálculo de cobro existente.
- Cierre: nueva entrada minor en `public/changelog.json` + `public/changelog/v7.272.0.json`, con `package.json` y `version.json` sincronizados.

## Fuera de alcance

No se restaura el acceso genérico de ventas a toda la bitácora (decisión de seguridad vigente) ni se corre el saneo de CxP en producción: el cron diario ya está activo.
