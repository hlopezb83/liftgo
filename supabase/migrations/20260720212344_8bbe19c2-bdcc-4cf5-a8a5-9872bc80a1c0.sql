-- BL-A5: registro de varianza entre total local vs total timbrado por Facturapi
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stamp_variance numeric(12,4);

COMMENT ON COLUMN public.invoices.stamp_variance IS
  'BL-A5: diferencia absoluta en MXN entre invoices.total (local) y el total devuelto por Facturapi al timbrar. Valores > 0.02 requieren revisión fiscal.';

-- Índice parcial: solo indexa facturas con varianza fuera de tolerancia,
-- útil para reportes de auditoría sin costo en el 99% de filas (variance <= 0.02).
CREATE INDEX IF NOT EXISTS invoices_stamp_variance_alert_idx
  ON public.invoices (id)
  WHERE stamp_variance > 0.02;