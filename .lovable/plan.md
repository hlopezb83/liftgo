# Auditoría R7 — validación y plan de corrección (18 hallazgos)

Revisé el código citado en cada hallazgo y consulté los datos reales de producción. Resumen de la validación:

- **Confirmados en código:** R7-01, R7-02, R7-03, R7-04, R7-05, R7-06, R7-08, R7-09, R7-10, R7-11, R7-12, R7-13, R7-14, R7-15, R7-16, R7-18, y la observación de seguridad de `v_booking_occupancy` (la vista quedó sin `security_invoker`, verificado en el catálogo de la base).
- **Sin impacto en datos actuales:** R7-07 (0 facturas con régimen legacy, 0 clientes) y R7-17 (0 gastos duplicados por factura ligada). Siguen valiendo como blindaje preventivo, pero bajan de prioridad.
- **Riesgo de producción hoy:** R7-11 es el más urgente — cualquier edición de monto o moneda de una factura de proveedor con pagos revienta con "column sp.supplier_bill_id does not exist".

## Fase 1 — Bugs que rompen o cobran de más (alta prioridad)

1. **R7-11 · CxP:** recrear el trigger de cambio de monto usando `sp.bill_id`. Prueba SQL que edite montos con y sin pagos.
2. **R7-02 · CxP:** el trigger de borrado de lote solo libera el bloqueo si la factura no tiene items en ningún otro lote vivo (mismo predicado que el barrido).
3. **R7-01 · Recurrentes:** el checkbox de "tarifa modificada" deja de reiniciar la selección; se hace merge conservando las deselecciones manuales.
4. **R7-05 · Portal:** el saldo del cliente excluye facturas en moneda extranjera sin tipo de cambio y muestra el aviso con el conteo (mismo criterio que los KPIs internos).
5. **R7-03 + R7-04 + R7-16 · CFDI:** catálogo SAT completo (agregar 609, 628, 629, 630), normalización con frontera exacta de 3 dígitos, y aplicar el fail-fast de régimen también en nota de crédito y complemento de pago.
6. **R7-06 · Cron de mantenimiento:** dejar de revertir el claim al inicio de la corrida (revertir solo al último mes exitoso) y agregar índice único por unidad + tipo de servicio + mes para que un reintento no duplique órdenes.

## Fase 2 — Cifras inconsistentes (media prioridad)

7. **R7-08 · FX falso:** el parser de CFDI deja el tipo de cambio en NULL en vez de 1, el formulario de factura de proveedor exige capturarlo cuando la moneda no es MXN, y `isFxMissing` trata TC=1 en moneda extranjera como faltante.
8. **R7-10 · Estado de Resultados:** un gasto ligado solo se excluye si su factura realmente contribuye al periodo; si la factura está cancelada, en borrador, rechazada o sin TC, el gasto vuelve a contarse.
9. **R7-13 · Aging:** el reporte de antigüedad y los KPIs de CxP iteran el mismo universo de filas.
10. **R7-09 + R7-12 · Bloqueos CxP:** el barrido libera bloqueos viejos aunque el lote exista, siempre que no tenga pagos; el botón se habilita según el conteo real de bloqueos liberables y muestra un aviso con cuántos liberó.
11. **R7-14 · Dashboard:** cada tarjeta de MRR muestra su propio conteo de exclusiones (se elimina el `Math.max`).

## Fase 3 — Detalles y blindaje (baja prioridad)

12. **R7-15:** unificar el predicado de tipo de cambio inválido a `<= 0` en suma y conteo del MRR.
13. **R7-18 + seguridad:** anclar los casts de fecha de la vista de ocupación a Monterrey y restaurar `security_invoker = on`.
14. **R7-07 + R7-17:** migración de normalización de régimen en snapshots de facturas y dedup previo al índice único (hoy sin filas afectadas, se aplican como red de seguridad idempotente).

## Notas técnicas

- Todas las migraciones SQL siguen las reglas permanentes: `SET search_path = public`, guards de rol, sin `FOR ALL ... USING (true)`, `(select auth.uid())` en policies, y GRANT/REVOKE explícitos.
- Cada corrección lleva su prueba de regresión (vitest para UI/hooks, smoke SQL para triggers y RPCs), tal como pide la nota de proceso de la auditoría.
- Sin cambios en reglas de negocio existentes, RLS ni máquinas de estado más allá de lo que cada hallazgo exige.
- Al cerrar cada fase: nueva entrada de changelog y bump de versión (Fase 1 minor, Fases 2 y 3 patch/minor según alcance).
