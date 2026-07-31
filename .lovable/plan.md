# Ronda 7 (UI/UX) — validación y plan de aplicación

## Qué verifiqué contra la base real (no supuestos)

- **Folios (R7-DB-01): problema real aquí, no sólo del seed.** `next_quote_number()` y `next_invoice_number()` son hoy un `nextval` pelón. La secuencia de facturas va en **85** mientras el folio real más alto es **FAC-0095**: los próximos 10 intentos de facturar chocarían con el índice único (error 409). Cotizaciones sí van bien (seq 418 vs max 416), pero la misma clase de desfase puede repetirse.
- **Cartera vencida (R7-DB-02): incoherencia real, en sentido inverso al del documento.** Hay **10 facturas** con estado `sent`/`partial` cuya fecha de vencimiento ya pasó. El listado de vencidas del Panel las cuenta (usa `due_date < hoy`), pero el desglose por estado del mismo RPC agrupa por estado crudo y las muestra como "Sin pagar". No hay ninguna factura marcada `overdue` con fecha futura (ese caso es artefacto del seed local del auditor).
- **`repaired_at` (R7-FE-03): confirmado.** La columna existe en la base y ningún archivo de la app la escribe al marcar un daño como reparado.
- **Beneficiario SPEI (R7-POR-01): confirmado.** 4 cuentas bancarias tienen el beneficiario vacío; por eso el portal muestra "—". Es dato faltante, no bug de código.
- **Saneo de flota (R7-DB-03):** no pude ejecutar la auditoría de consistencia con permisos de sólo lectura, así que no afirmo cuántas unidades están desfasadas en esta base.

## Qué se va a aplicar

### Base de datos
1. **R7-DB-01 — folios auto-curativos (P0).** Las funciones de folio pasan a tomar el mayor entre la secuencia y el máximo real existente, y se agrega un bloque idempotente que resincroniza todas las secuencias (cotizaciones, reservas, entregas, facturas, notas de crédito, contratos, facturas de proveedor). Esto arregla el desfase FAC-0095 de inmediato.
2. **R7-DB-02 — cartera vencida coherente (P1).** El desglose por estado del Panel deja de usar el estado crudo y aplica el mismo criterio que el listado de vencidas, más un disparador que impide guardar una factura como "vencida" con fecha de vencimiento futura.

**Decisión propuesta: no aplicar R7-DB-03** (el saneo masivo de estados de flota). Es opt-in, no puedo confirmar el desfase en esta base y el frontend de R7-FE-01 ya deriva el estado correcto para lo que se muestra. Si más adelante quieres, corremos primero la auditoría en modo diagnóstico y decidimos.

**Beneficiario SPEI:** en vez de un parche de datos del seed, se propone rellenar el beneficiario de las 4 cuentas con la razón social de la empresa (dato de configuración), como corrección puntual de datos.

### Frontend (9 paquetes, independientes entre sí)
- **FE-01** Badges de flota: estado derivado en ambos sentidos (rentado sin reserva → disponible) en Equipos y en la lista del Calendario, sin parpadeo mientras cargan las reservas.
- **FE-02** Fecha del detalle de daño en zona horaria Monterrey (hoy usa la del navegador y se desfasa un día contra la lista).
- **FE-03** "Marcar reparado" sella `repaired_at`.
- **FE-04** Pantalla de carga con indicación de fase ("Conectando…", "Verificando sesión…") en lugar de un splash mudo.
- **FE-05** Tablas del portal (partidas y estado de cuenta) legibles a 402/698 px con ancho mínimo y scroll con afordancia.
- **FE-06** Estados vacíos del portal con texto orientativo y acción sugerida (panel, rentas, cotizaciones, facturas, contratos, estado de cuenta).
- **FE-07** Menores de escritorio: asterisco y aviso en "Costo por Daños", nombres accesibles en selects, bitácora sin inglés crudo, ortografía de catálogos ("inspección", "preventivo"), aviso correcto de modelos de equipo y botón primario con etiqueta a 698 px.
- **FE-08** Móvil: arrastre de kanban sin pelear con el scroll, y objetivos táctiles ≥44 px en nav lateral, panel, acciones de mantenimiento y toggles lista/tablero.
- **FE-09** Portal: menú hamburguesa con afordancia, equipo visible en contratos enviados, toast que ya no tapa el encabezado y estado de cuenta vacío sin ofrecer "Descargar PDF".

## Ejecución

Se aplican las 2 migraciones en orden y los 9 paquetes de frontend en paralelo con subagentes, seguidos de typecheck y la suite de pruebas. Se agregan pruebas para el estado derivado de flota, el formato de fecha en Monterrey y el sellado de `repaired_at`.

## Verificación

- Crear una factura y una cotización sin conflicto de folio.
- Contador de "vencidas" del Panel igual al desglose por estado.
- Badges de Equipos y Calendario coincidiendo con el encabezado.
- Detalle y lista de daños con la misma fecha; `repaired_at` poblado al reparar.
- Portal a 402 px: tablas legibles y menú funcional.

## Cierre

Nueva entrada **menor** en `public/changelog.json` + `public/changelog/v7.271.0.json`, alineando `package.json` y `version.json`.
