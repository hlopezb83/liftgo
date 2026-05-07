
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_identifier_created
  ON public.rate_limits (bucket, identifier, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Solo el service role (Edge Functions) accede; sin policies => deny por defecto a clientes.

-- Función helper SECURITY DEFINER para chequear y registrar en una sola transacción.
CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(
  _bucket TEXT,
  _identifier TEXT,
  _max_requests INT,
  _window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INT;
BEGIN
  -- Limpia entradas viejas (best effort, no bloquea)
  DELETE FROM public.rate_limits
  WHERE bucket = _bucket
    AND created_at < now() - (_window_seconds || ' seconds')::interval
    AND identifier = _identifier;

  SELECT COUNT(*) INTO _count
  FROM public.rate_limits
  WHERE bucket = _bucket
    AND identifier = _identifier
    AND created_at >= now() - (_window_seconds || ' seconds')::interval;

  IF _count >= _max_requests THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limits (bucket, identifier) VALUES (_bucket, _identifier);
  RETURN TRUE;
END;
$$;
