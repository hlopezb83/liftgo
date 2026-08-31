# Cierre de los bugs abiertos (documento del 31/08/2026)

El documento fue elaborado sobre el commit `a1c8af8`. HEAD ya está en v7.392.1, así que primero revalidé lo más grave contra la base de datos y el código actuales.

## Revalidación contra HEAD (ya verificado)

Cerrados — no requieren trabajo:

- **2A-1 / 2A-2 (Estado de resultados sin FX y con bills draft/rejected).** La migración `20260831054419` **sí se aplicó**: la función viva `get_income_statement` ya convierte gastos de proveedor con `exchange_rate`, excluye `draft`/`cancelled` y `approval_status='rejected'`, y excluye documentos en divisa sin tipo de cambio. El "AVISO PREVIO — NO DESPLEGAR" del documento no aplica al estado actual; la cadena de migraciones no está detenida.
- **A6R2-2 (auto-aprobación CxP).** `approve_supplier_bill` ya compara el creador contra el usuario actual y el diálogo muestra la explicación (v7.392.x).
- **2A-7 (`is_e2e` en dashboard).** `get_dashboard_stats` ya filtra `bk.is_e2e` / `b.is_e2e` en utilización mensual y rentas vencidas.

Confirmados abiertos hoy:

- **A4B-11** — `get_portal_invoices` no usa `exchange_rate` (saldo del portal sin conversión).
- **B5-02** — `get_customer_summary` no filtra `draft` (PDF de estado de cuenta ≠ pantalla).
- **A1-5** — `prepare_payment_complement` no usa `exchange_rate` (REP cross-currency).
- **A6R2-5** — no existe RPC `reopen_work_order` ni guard de salida de `completed`; el kanban solo intercepta drops hacia "Completado".
- **B5-06** — `sanitizeInvoiceSearchForQuery` solo limpia `[%,()]`.
- **2A-8, A6R2-6, A3B-07, A6R2-7** — sin cambios respecto al reporte (pendientes de revalidación puntual al momento de corregir).

## Lote 1 — Consistencia de saldos y divisas (prioridad)

1. **A4B-11:** reescribir `get_portal_invoices` para derivar `paid_amount`/`balance` del criterio canónico de `v_invoices_with_balance` (conversión FX con el mismo CASE), sin cambiar RLS ni columnas expuestas al portal.
2. **B5-02:** en `get_customer_summary`, excluir `draft` del universo de facturas y alinear `total_invoiced`/`total_paid` con el criterio de la pantalla (incluida la deducción canónica de notas de crédito).
3. **A1-5:** convertir los pagos a la moneda de la factura en la suma, en el guard de monto y en el payload de `stamp-payment-complement`; si la conversión no es posible (sin TC), rechazar con error explícito en vez de mezclar monedas.

## Lote 2 — Integridad de estados

4. **A6R2-5:** RPC `reopen_work_order(p_log_id, p_reason)` solo para admin con bitácora, trigger `BEFORE UPDATE OF work_status` que rechaza salir de `completed`/`cancelled` fuera de la RPC, y en el kanban deshabilitar el arrastre desde "Completado" con la explicación correspondiente.
5. **A6R2-6:** al cancelar/eliminar la factura del cargo por daño, regresar el daño a un estado re-cobrable (`invoice_id = NULL`), para que el cargo pueda volver a facturarse.
6. **2A-8:** acotar los días rentados de utilización por entrega/devolución reales y extender rentas vencidas sin devolución hasta hoy.

## Lote 3 — Bajos

7. **B5-06:** extraer el sanitizador de búsqueda a `src/lib/` y usarlo tanto en facturas como en la búsqueda global (escapar `_`, `%`, comillas), con prueba de paridad.
8. **A6R2-7:** `company_settings.maintenance_buffer_days` (default 3) leído por una función canónica `maintenance_window_blocked`, usada por `create_booking`, `extend_booking` y `get_available_forklifts` con criterio bilateral único.
9. **A3B-07:** cerrar el vector latente de entregas `type='return'` unificando el predicado de "devolución registrada" con la inspección de retorno.

## Notas técnicas

- Todas las migraciones nuevas usan `CREATE OR REPLACE` completo, no `replace()` sobre `pg_get_functiondef`, y respetan las reglas permanentes (RLS, GRANT, `(select auth.uid())`, `SET search_path = public`, guards de rol).
- No se debilita ninguna regla de negocio, RLS, máquina de estados, guard de RPC, lógica fiscal ni permiso existente.
- Cada lote añade smoke SQL / pruebas focalizadas, y actualiza changelog y versión (minor por lote).
- Al terminar: typecheck, ESLint, pruebas focalizadas y validación JSON del changelog.
