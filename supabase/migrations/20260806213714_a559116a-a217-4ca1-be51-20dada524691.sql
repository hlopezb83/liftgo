-- v7.282.0: una sola plantilla de contrato predeterminada.
-- 1) Desmarca/elimina plantillas predeterminadas vacías (sin cláusulas ni intro).
DELETE FROM public.contract_templates t
WHERE t.is_default = true
  AND COALESCE(NULLIF(btrim(COALESCE(t.intro_text, '')), ''), NULL) IS NULL
  AND COALESCE(jsonb_array_length(
        CASE WHEN jsonb_typeof(to_jsonb(t.clauses)) = 'array' THEN to_jsonb(t.clauses) ELSE '[]'::jsonb END
      ), 0) = 0
  AND EXISTS (
    SELECT 1 FROM public.contract_templates o
    WHERE o.is_default = true AND o.id <> t.id
      AND COALESCE(jsonb_array_length(
            CASE WHEN jsonb_typeof(to_jsonb(o.clauses)) = 'array' THEN to_jsonb(o.clauses) ELSE '[]'::jsonb END
          ), 0) > 0
  );

-- 2) Si aún quedara más de una, conserva la más reciente.
UPDATE public.contract_templates
SET is_default = false
WHERE is_default = true
  AND id <> (
    SELECT id FROM public.contract_templates
    WHERE is_default = true
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1
  );

-- 3) Garantiza unicidad a futuro.
CREATE UNIQUE INDEX IF NOT EXISTS contract_templates_single_default_idx
  ON public.contract_templates ((is_default))
  WHERE is_default = true;