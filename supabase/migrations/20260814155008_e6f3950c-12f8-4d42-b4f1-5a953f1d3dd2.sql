-- 1) Normalizar duplicados históricos de (stage, stage_order)
WITH renumbered AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY stage ORDER BY stage_order, created_at, id) - 1) AS rn
  FROM public.prospects
)
UPDATE public.prospects p
SET stage_order = r.rn
FROM renumbered r
WHERE p.id = r.id
  AND p.stage_order IS DISTINCT FROM r.rn;

-- 2) Red de seguridad: un solo prospect por (stage, stage_order).
-- `next_stage_order` ya serializa con advisory lock; este constraint cierra
-- la ventana entre el cálculo del orden y el INSERT. DEFERRABLE para que el
-- reordenamiento masivo del Kanban (RPC de reindexado) no falle a media
-- transacción.
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_stage_order_uniq
  UNIQUE (stage, stage_order) DEFERRABLE INITIALLY IMMEDIATE;