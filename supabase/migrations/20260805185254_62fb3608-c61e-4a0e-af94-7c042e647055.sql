CREATE OR REPLACE FUNCTION public.validate_invoice_line_items_signs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb; qty numeric; price numeric; amount numeric; discount numeric;
  dtype text; base numeric; net numeric;
  v_sum numeric := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'draft'
     AND COALESCE(NEW.subtotal, 0) > 0
     AND (NEW.line_items IS NULL OR jsonb_typeof(NEW.line_items) <> 'array'
          OR jsonb_array_length(NEW.line_items) = 0) THEN
    RAISE EXCEPTION 'Una factura fuera de borrador requiere al menos una partida en line_items (subtotal=%).', NEW.subtotal
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.line_items IS NULL OR jsonb_typeof(NEW.line_items) <> 'array' THEN RETURN NEW; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    qty := COALESCE((item->>'quantity')::numeric, 1);
    price := COALESCE((item->>'unit_price')::numeric, 0);
    amount := COALESCE((item->>'amount')::numeric, COALESCE((item->>'total')::numeric, qty * price));
    discount := COALESCE((item->>'discount')::numeric, 0);
    dtype := COALESCE(item->>'discount_type', '%');
    IF qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a cero (recibido: %). Descripcion: %', qty, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF price < 0 THEN
      RAISE EXCEPTION 'Precio unitario no puede ser negativo (recibido: %). Descripcion: %', price, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF amount < 0 THEN
      RAISE EXCEPTION 'El importe de la partida no puede ser negativo (recibido: %). Descripcion: %', amount, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF discount < 0 THEN
      RAISE EXCEPTION 'El descuento de la partida no puede ser negativo (recibido: %). Descripcion: %', discount, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;

    base := round(amount, 2);
    IF discount = 0 THEN
      net := base;
    ELSIF dtype = '$' THEN
      net := greatest(0, round(base - discount, 2));
    ELSE
      net := greatest(0, round(base - round(base * least(discount, 100) / 100, 2), 2));
    END IF;
    v_sum := v_sum + net;
  END LOOP;

  IF jsonb_array_length(NEW.line_items) > 0
     AND NEW.subtotal IS NOT NULL
     AND abs(v_sum - round(NEW.subtotal, 2)) > 0.05 THEN
    RAISE EXCEPTION 'Las partidas no cuadran con el subtotal: suma de partidas (%) <> subtotal (%) (tolerancia 0.05).',
      v_sum, NEW.subtotal USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;