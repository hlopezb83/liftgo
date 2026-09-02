# Plan de corrección R9 + R10 validado

## Resultado de la validación

De los 16 hallazgos del documento:

- **13 vigentes:** R10-01, R10-04, R10-03, R10-05, R10-06, R10-09, R10-11, R10-12, R10-13, R10-10, R10-08, R10-07 y R9-19.
- **1 ya resuelto:** R10-02. El generador recurrente ya deduplica usando el inicio y fin reales del periodo, incluido el primer periodo prorrateado. Solo se agregará una prueba de regresión para cerrarlo con evidencia.
- **1 sin impacto pendiente:** R10-14. `recurring_billing` es `NOT NULL`, no existen valores nulos y las reservas RSV-0032/0033 ya quedaron corregidas. No se reescribirá una migración histórica ni se hará otro cambio de datos.
- **1 no verificable:** R9-20. El documento no identifica la migración o expresión concreta y existen muchos usos legítimos de `btrim`. No se eliminará ninguno a ciegas; quedará documentado como “requiere referencia del hallazgo R9 original”.

## Implementación por olas

### Ola 1 — Dinero y periodos

1. **Unificar FX en reportes (R10-01)**
   - Crear una migración hacia adelante que reemplace únicamente las definiciones vigentes de `get_dashboard_stats`, `get_mrr_detail` y `get_forklift_financials`.
   - Sustituir la aceptación de divisas con TC `NULL`, `<= 0` o `= 1` por la regla canónica existente `fx_is_missing`.
   - Conservar firmas, permisos, filtros, fórmulas y estructura de respuesta.

2. **Conservar depreciación histórica (R10-04)**
   - Ajustar `get_income_statement` para incluir un equipo en meses iniciados antes o durante su fecha de archivo y excluirlo en meses posteriores.
   - No cambiar ninguna otra partida del estado de resultados.

3. **Cerrar la regresión del primer periodo prorrateado (R10-02)**
   - No cambiar la lógica actual.
   - Añadir una prueba que ejecute dos veces una reserva iniciada a mitad de mes y confirme que no se duplica ni se omite el periodo.

4. **Facturación manual no recurrente completa (R10-03)**
   - Incluir `recurring_billing` en el tipo/datos usados para precargar la factura.
   - Mantener el primer periodo prorrateado para reservas recurrentes.
   - Para reservas no recurrentes, precargar todo el rango de la reserva y evitar el truncamiento silencioso.
   - Mostrar el aviso de periodo parcial únicamente cuando realmente se facture una fracción del contrato.

### Ola 2 — Conciliación y acciones operativas

5. **Excluir datos de prueba en conciliación (R10-05)**
   - Crear una migración hacia adelante para filtrar `payments.is_e2e` y `supplier_payments.is_e2e` en auto-match, candidatos y confirmación.
   - Mantener intactos permisos, locks, tolerancias y conversión monetaria.

6. **Hacer visible el límite del generador recurrente (R10-06)**
   - Detectar cuando una reserva rebasa las 24 iteraciones.
   - Emitir un warning estructurado y devolver `truncated` y `pending_count` en vista previa y ejecución.
   - No aumentar el límite ni introducir cursores.

7. **Alinear borrado de reservas con la regla real (R10-09)**
   - Bloquear en UI todos los estados distintos de `cancelled` y `completed`, usando la explicación de negocio existente.
   - No modificar la RPC ni ampliar estados permitidos.

8. **Evitar doble envío al eliminar o cancelar (R10-11)**
   - Exponer los estados pendientes de ambas mutaciones y deshabilitar sus confirmaciones mientras la solicitud está en curso.

### Ola 3 — Exportaciones y recurrencia

9. **Exportar todas las facturas filtradas (R10-12)**
   - Extraer/reusar la consulta filtrada existente para obtener el conjunto completo al exportar, sin depender de las páginas cargadas por scroll.
   - Mantener exactamente los mismos filtros y orden del listado, con límite de seguridad explícito.

10. **Alinear mantenimiento con los filtros visibles (R10-13)**
    - Calcular costo, conteo y CSV desde `filtered`, igual que tabla y Kanban.

11. **Confirmar antes de apagar recurrencia (R10-10)**
    - Reusar `ConfirmDialog` al desactivar.
    - Calcular y mostrar los periodos pendientes con la lógica de periodos ya existente; cancelar no muta y confirmar sí.
    - Mantener activación directa y respetar permisos/estados cerrados actuales.

### Ola 4 — Pruebas y mínimo privilegio

12. **Reparar smoke tests R9 (R10-08)**
    - Leer `total_paid` y `total_invoiced` dentro de `totals`.
    - Sustituir el ancla inexistente `paid_amount` por la comprobación real del guard de pagos.
    - Validar `fx_missing_count` en la ubicación real del JSON.
    - Evitar excepciones silenciosas que conviertan una prueba inválida en falso positivo.

13. **Mantener coherente la migración intermedia (R10-07)**
    - Como las migraciones ya forman parte del historial, no reescribir su efecto en producción.
    - Corregir la definición histórica 175006 para que un `db reset` o aplicación parcial no reintroduzca el bypass; 181520 seguirá siendo la corrección forward-only efectiva.
    - Añadir una prueba de migración parcial específica para el cambio de total con TC faltante.

14. **Revocar ejecución pública de `fx_is_missing` (R9-19)**
    - Crear migración hacia adelante que quite `PUBLIC` y conceda ejecución solo a `authenticated` y `service_role`.
    - No tocar RLS ni ampliar permisos.

15. **Cerrar R9-20 y R10-14 sin cambios inseguros**
    - Registrar R9-20 como pendiente de referencia exacta, sin eliminar usos legítimos de `btrim`.
    - Registrar R10-14 como no reproducible en el esquema/datos actuales; añadir una comprobación de invariante `recurring_billing NOT NULL` en lugar de otro backfill.

## Validación

- Pruebas unitarias dirigidas para precarga manual, deduplicación recurrente, guard de borrado, doble submit, exportaciones, totales filtrados y confirmación de recurrencia.
- Smoke SQL para FX canónico, depreciación histórica, exclusión E2E, permisos de `fx_is_missing`, aprobación CxP y la invariante de recurrencia.
- Pruebas de la función recurrente para respuesta truncada y periodo prorrateado.
- Ejecutar la suite existente completa y validar que no disminuya el total de pruebas exitosas.
- Revisar el build final y los diagnósticos del preview.

## Entrega y control de alcance

- Cambios mínimos, sin alterar reglas de negocio, RLS, máquinas de estado, permisos existentes ni validaciones fiscales salvo el endurecimiento explícito de mínimo privilegio.
- Migraciones nuevas para cambios efectivos en producción; edición histórica solo para que instalaciones limpias/parciales sean coherentes.
- Actualizar la versión como cambio **minor**, agregar la entrada al inicio del changelog JSON y actualizar `CHANGELOG.md` con fecha local de México.