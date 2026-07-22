-- R7 Bloque 21.16 · Prevent duplicate part entries in the same maintenance work order.
-- Consolidate any existing duplicates first, then add unique index.

WITH first_rows AS (
  SELECT
    (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keep_id,
    sum(quantity_used) AS total_qty,
    maintenance_log_id,
    part_id
  FROM public.maintenance_parts
  GROUP BY maintenance_log_id, part_id
  HAVING count(*) > 1
)
UPDATE public.maintenance_parts mp
SET quantity_used = fr.total_qty
FROM first_rows fr
WHERE mp.id = fr.keep_id;

DELETE FROM public.maintenance_parts
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY maintenance_log_id, part_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
    FROM public.maintenance_parts
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_parts_log_part_unique
  ON public.maintenance_parts (maintenance_log_id, part_id);

COMMENT ON INDEX public.maintenance_parts_log_part_unique IS
  'R7 21.16 · Evita insertar la misma refaccion dos veces en la misma OT. Usar UPDATE de quantity_used para incrementos.';