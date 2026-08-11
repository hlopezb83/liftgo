# Auditoría Ronda "Medios" (M-1 … M-22)

Revisión del diff subido: contiene 22 hallazgos de severidad media que tocan
seguridad de backend, consistencia de datos financieros y estabilidad de UI.
Verifiqué en el repo que varios de los puntos siguen sin corregir hoy
(`src/lib/exportCsv.ts` sin mitigación de fórmulas, `src/lib/staleChunkReload.ts`
no existe, `useEntitySearch` ignora los `.error` de las consultas), así que la
ronda aplica. El resto se valida hallazgo por hallazgo antes de tocar código.

## 1. Seguridad y acceso (backend)

- **M-1 · Sesiones de usuarios desactivados**: `authenticateWithDeps` verificará
  `profiles.is_active` después de validar el JWT. Hoy un token vigente (~1 h)
  sigue funcionando aunque se desactive al usuario.
- **M-2 · Cancelación de nota de crédito**: aplicar el mismo guard que
  `cancel-cfdi` para no cancelar documentos reales en modo live sin validación.
- **M-3 · Contadores del sidebar**: `get_sidebar_badge_counts` es
  SECURITY DEFINER sin guard de rol; cualquier usuario autenticado (incluidos
  clientes del portal) puede leer métricas internas. Se agrega guard de rol
  para personal interno.
- **M-4 · RoleGuard fail-closed**: si no se puede verificar rol/permisos, no
  renderizar la ruta protegida.
- **M-9 · Pagos del portal**: la política RLS actual consulta `invoices`, cuyo
  SELECT para clientes fue revocado, así que el portal no muestra ningún pago.
  Se reemplaza por una función SECURITY DEFINER de ownership.
- **M-10 · Búsqueda global**: escapar el término antes de interpolarlo en
  `.or()` de PostgREST y dejar de silenciar los errores de consulta.
- **M-11 · Inyección de fórmulas en CSV**: prefijar celdas que empiezan con
  `= + - @` al exportar.

## 2. CFDI y timbrado

- **M-6, M-7, M-8**: unificar el manejo de respuestas del PAC en cancelaciones
  (complemento de pago y nota de crédito): mapear estados SAT, tratar el 409
  como éxito idempotente, no marcar como cancelado sin confirmación del SAT y
  verificar el error del `UPDATE` en lugar de fallar en silencio.

## 3. Datos financieros

- **M-14 · Resumen financiero de contrato**: comparar el ingreso esperado
  (sin IVA) contra el **subtotal** facturado, no contra el total.
- **M-15 · Conciliación de facturas**: convertir USD a MXN con su tipo de
  cambio antes de sumar; hoy se suman 1:1.
- **M-20 · Exportación de pagos a proveedores**: validar por renglón que el
  monto no exceda el saldo y marcar visualmente el renglón excedido.
- **M-21 · Factura de proveedor**: las retenciones no pueden exceder la base
  gravable y los totales se redondean a 2 decimales.
- **M-13 · Reporte de antigüedad**: alinear la definición de "vencida" con
  `v_overdue_invoices`.

## 4. Caché e invalidaciones

- **M-5** rol de usuario tras cambio de permisos, **M-12** proyección de flujo
  de efectivo al registrar pagos y aprobaciones (hoy se invalida una llave
  muerta), **M-17** listados de reservas por montacargas.

## 5. UI y estabilidad

- **M-16 · Equipos disponibles**: usar `isSuccess` para no mostrar "sin
  disponibilidad" mientras la consulta carga.
- **M-18 · Reporte de daño**: recordar el registro ya creado cuando falla la
  subida de fotos, para no duplicarlo al reintentar.
- **M-19 · Subida de fotos**: bloquear el dropzone mientras hay subida en curso
  y usar `allSettled` para conservar solo las fotos fallidas (hoy un fallo
  duplica las exitosas al reintentar).
- **M-22 · Recarga por versión nueva**: extraer la guarda anti-bucle a
  `src/lib/staleChunkReload.ts` (timestamp + máximo 2 recargas por ventana) y
  usarla en `main.tsx`, `ErrorBoundary` y el router.

## Detalles técnicos

- 2 migraciones nuevas (M-3 y M-9) aplicadas vía la herramienta de migración.
- Edge functions afectadas: `_shared/authWithDeps`, `cancel-credit-note`,
  `cancel-payment-complement`, `cancel-cfdi` (tests) — se redespliegan.
- Se agregan/actualizan pruebas Deno para M-1/M-2/M-6/M-7/M-8 y pruebas
  unitarias en frontend para exportCsv, conciliación multimoneda, resumen
  financiero de contrato y la guarda de recarga.
- Cierre: actualizar `package.json`, `public/version.json`,
  `public/changelog.json` y `public/changelog/v7.291.0.json`; correr typecheck,
  lint y la suite completa.
