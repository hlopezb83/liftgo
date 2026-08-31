-- A5-09: dedup de líneas bancarias independiente del orden del archivo.
-- Antes: hash = sha256(line_seq | fecha | monto | referencia | descripción) con
-- índice único (bank_account_id, hash). Al depender de `line_seq`, un archivo
-- traslapado o reordenado producía hashes distintos para el mismo movimiento y
-- se insertaban duplicados.
-- Ahora: hash = sha256(fecha | monto | referencia | descripción) + columna
-- `occurrence` (n-ésima repetición del mismo contenido dentro de la cuenta),
-- con índice único (bank_account_id, hash, occurrence).

ALTER TABLE public.bank_statement_lines
  ADD COLUMN IF NOT EXISTS occurrence integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.bank_statement_lines.occurrence IS
  'A5-09: n-esima repeticion de un movimiento con contenido identico dentro de la misma cuenta. Permite movimientos legitimamente iguales sin depender del orden del archivo.';

-- Backfill: recomputa el hash con el esquema nuevo (sin line_seq) y numera las
-- repeticiones por (cuenta, hash) de forma determinista.
WITH recomputed AS (
  SELECT
    id,
    left(
      encode(
        extensions.digest(
          concat_ws(
            '|',
            to_char(posted_date, 'YYYY-MM-DD'),
            trim(to_char(signed_amount, 'FM9999999999990.00')),
            coalesce(reference, ''),
            left(description, 80)
          ),
          'sha256'
        ),
        'hex'
      ),
      20
    ) AS new_hash,
    bank_account_id
  FROM public.bank_statement_lines
), numbered AS (
  SELECT
    id,
    new_hash,
    row_number() OVER (PARTITION BY bank_account_id, new_hash ORDER BY id) AS occ
  FROM recomputed
)
UPDATE public.bank_statement_lines l
SET hash = n.new_hash,
    occurrence = n.occ
FROM numbered n
WHERE n.id = l.id;

DROP INDEX IF EXISTS public.bank_statement_lines_account_hash_uq;

CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_account_hash_occ_uq
  ON public.bank_statement_lines (bank_account_id, hash, occurrence);