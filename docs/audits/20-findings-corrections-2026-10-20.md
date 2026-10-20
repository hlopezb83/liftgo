# Correcciones de los 20 hallazgos del 20 de octubre de 2026

Base auditada: `d37f0fde2640853ace2b54f675985e5393cd041b` (PR 308).
Este lote no incluye el roadmap de PR 309, la actualización de Vite ni los
hallazgos adicionales QR02/QR07. No cambia dependencias, workflows, permisos de
CI, funciones Edge desplegadas, versión publicada ni datos de una base compartida.

## Trazabilidad

| Hallazgo | Corrección | Regresión y control |
| --- | --- | --- |
| OP01 | Asignación por identidad del modelo, no su etiqueta mutable. | Renombrar el mismo modelo conserva unidades elegibles; otro ID sigue excluido. |
| OP02 | Una entrega histórica completada al crearla usa fecha/hora reales de Monterrey; completar una programada conserva reloj servidor. | Entrega histórica permite devolución posterior; fecha futura y alteración posterior siguen bloqueadas. |
| OP03 | Anular devolución conserva daños resueltos/archivados y su auditoría, desvinculándolos de la inspección anulada. | Reparaciones pendientes y daños ligados a facturación siguen bloqueados; no se elimina su historial. |
| OP04 | Cancelar reserva invalida también transporte y cotización. | Observadores reales reciben los cambios del servidor simulado, además del estado de reserva. |
| OP05 | Corregir horas recalcula horas extra e importe sugerido con la base original conservada en servidor. | 260→100 elimina 60 horas / 600 de exceso; aumentar a 300 produce 100 / 1000; cambiar tarifa después no repricing. |
| BF01 | Descuento porcentual normaliza base y redondea una sola vez el descuento final. | Una unidad de 1000.99 al 0.5% produce 995.99 y es aceptada por el validador canónico; controles de precisión y descuentos monetarios. |
| BF02 | Pagos sin REP se suman en moneda de factura antes de mostrar el aviso. | USD 50 a 20 equivale a 1000 MXN; FX ausente produce advertencia, no suma 1:1. |
| BF03 | Conciliación actualiza `paid_at` aunque el estado siga siendo pagado. | Cambios de fecha en ambas direcciones, varios pagos, reducción y eliminación. |
| BF04 | Estado final deriva sólo de cobertura financiera actual, no del estado previo. | Cancelar NC 60 de un total cubierto por NC 40 + 60 deja parcial / saldo 60; repetir es no-op. |
| BF05 | Líneas, máximos y totales del modal identifican moneda original. | EUR y USD se presentan con código correcto, sin conversión del importe. |
| BF06 | Mutaciones y conciliación de cancelación de NC invalidan estado de resultados. | Consulta previamente fresca se vuelve a obtener, sin esperar 60 segundos. |
| UX01 | Aplicar permite confirmar calendario vacío cuando el campo no es obligatorio. | Selector simple/rango, cancelar y controles de campos requeridos. |
| UX02 | Inputs de rango comparten descripción de error y `aria-invalid`. | Asociación accesible de ambos inputs y coexistencia con error propio de captura. |
| UX03 | Fecha de factura vacía/imposible invalida el formulario; no se convierte en hoy. | Submit bloqueado y recuperación con fecha válida. |
| UX04 | Captura no vacía inválida se distingue del vaciado voluntario en `DateField`. | Fecha opcional inválida no borra programación; parcial requerida no guarda valor anterior; borrar voluntariamente sigue permitido. |
| UX05 | Valores iniciales de mantenimiento se crean al abrir/restablecer. | Abrir/reabrir después de medianoche usa el día vigente. |
| QR01 | Totales/tablas secundarias de proveedor distinguen carga, error y vacío confirmado. | Consultas independientes, reintento local y totales válidos. |
| QR04 | Exportación recorre páginas hasta respuesta vacía, avanzando por cantidad efectiva. | 10 001 filas completas, cap del servidor menor que la página solicitada y fallo intermedio sin archivo parcial. |
| QR05 | Fecha civil XLSX se formatea sin convertir primero a un instante UTC. | 20/oct y 1/ene conservan día; timestamp real mantiene conversión de zona. |
| QR06 | Orden global en servidor, columnas permitidas, desempate ID y reinicio de página al cambiar orden. | 150 filas sin repeticiones, ascendente/descendente, empates, nulos y cambio desde página 4. |

## Límites importantes

- OP05 no genera cobros ni modifica facturas. La base histórica sólo puede
  recuperarse cuando existe evidencia de que reserva/contrato no cambiaron.
  Un histórico sin base confiable requiere revisión administrativa explícita;
  no se sustituye silenciosamente por la tarifa vigente.
- En formularios RHF, `DateField` usa `null` para texto inválido y `undefined`
  para vaciado intencional. Los consumidores actuales validan con `z.date()`
  requerido u opcional, nunca nullable. No introducir un esquema nullable sin
  preservar la distinción de invalidez.
- Las pruebas de componentes emplean respuestas ficticias de red. Las pruebas
  PostgreSQL focales ejecutan SQL real en un esquema mínimo desechable; no
  sustituyen el gate sobre el esquema completo ni una aceptación publicada.
- No se ha ejecutado migración remota, operación fiscal real, fusión ni publicación
  como parte de este lote.

## Validación reproducible

Calidad y suite integral de CI existentes:

```sh
bun run lint --max-warnings=0
bun run typecheck
bun run typecheck:browser-tests
bun run arch:check
bun run migrations:check
bun scripts/lint-migrations.ts drizzle/migrations/0115_operational_audit_corrections.sql drizzle/migrations/0116_invoice_settlement_reconciliation.sql
bun run test:coverage
```

El build/smoke/móvil debe conservar la configuración ficticia loopback definida
por CI. Nunca reutilizar `.env` para pruebas que puedan escribir.

El workflow RLS DB existente ejecuta las regresiones SQL nuevas sobre el esquema
completo junto con todas las suites históricas. Multi-tenant A/B verifica el
aislamiento mediante API y Storage reales de un Supabase local efímero. No se
relajan políticas, se deshabilitan triggers ni se cambian exclusiones para pasar.

El estado definitivo de los gates se debe consultar para el SHA exacto del PR.
Una corrida pendiente, omitida o interrumpida no cuenta como aprobada. Aplicar
las migraciones y publicar son pasos separados, posteriores a revisión y a la
autorización correspondiente.
