-- Reject NEW sales using obsolete 11% VAT without rewriting historical documents.
-- Related credit notes and payment complements deliberately remain untouched.
CREATE OR REPLACE FUNCTION public.is_obsolete_vat_rate(p_rate text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN COALESCE(p_rate::numeric = 11, false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_obsolete_vat_new_sales()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Preserve unrelated edits to historical rows, including their stored amounts.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tax_rate IS NOT DISTINCT FROM OLD.tax_rate
       AND NEW.line_items IS NOT DISTINCT FROM OLD.line_items THEN
      RETURN NEW;
    END IF;
  END IF;
  IF public.is_obsolete_vat_rate(NEW.tax_rate::text) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.line_items::jsonb) = 'array'
           THEN NEW.line_items::jsonb ELSE '[]'::jsonb END
    ) AS item
    WHERE public.is_obsolete_vat_rate(item->>'tax_rate')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'OBSOLETE_VAT_RATE: La tasa de IVA del 11% es obsoleta. Selecciona explícitamente una tasa vigente; no se convierte automáticamente.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_obsolete_vat_new_sales
BEFORE INSERT OR UPDATE OF tax_rate, line_items ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_obsolete_vat_new_sales();
--> statement-breakpoint
CREATE TRIGGER guard_obsolete_vat_new_sales
BEFORE INSERT OR UPDATE OF tax_rate, line_items ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_obsolete_vat_new_sales();
