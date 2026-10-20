-- Align the UI permission matrix with the operational-only dispatcher RLS.
-- Forward-only, no changes to other roles or policies. Reportes stays intact:
-- operational utilization reports remain accessible; financial reports are
-- separately guarded in the UI and retain their server-side authorization.
UPDATE public.role_permissions
SET access_level = 'none', updated_at = now()
WHERE role = 'dispatcher'
  AND module IN (
    'Facturas', 'Pagos', 'Gastos', 'MRR', 'Facturas de Proveedor',
    'Flujo de Caja', 'Cuentas Bancarias', 'Conciliación Bancaria'
  )
  AND access_level <> 'none';
