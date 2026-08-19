UPDATE public.contract_templates
SET
  pagare_text = $pag$En {ciudad}, a {fecha_firma}.

Bueno por {monto_pagare} ({monto_pagare_letra}).

Por valor recibido a mi (nuestra) entera satisfacción, me (nos) obligo(amos) incondicionalmente a pagar a la orden de {arrendador} la cantidad de {monto_pagare} ({monto_pagare_letra}), moneda nacional, precisamente el día {vencimiento_pagare}, en el domicilio de {arrendador} en {ciudad}, sin necesidad de requerimiento previo.

Este pagaré se suscribe como garantía del cumplimiento de las obligaciones derivadas del contrato de arrendamiento {contrato}, celebrado respecto del equipo {marca} {modelo}, serie {serie}, así como de la responsabilidad del arrendatario en caso de daños graves, robo parcial o total o pérdida del equipo durante la vigencia del referido contrato y sus prórrogas o renovaciones. Su importe corresponde al valor de reposición del equipo arrendado. El incumplimiento de cualquiera de las obligaciones de pago del contrato dará lugar al vencimiento anticipado de este título.

En caso de falta de pago puntual, la cantidad insoluta causará intereses moratorios a razón del {interes_moratorio}% mensual sobre saldo insoluto, desde la fecha de vencimiento y hasta su total liquidación.

El (los) suscriptor(es) y su(s) aval(es) renuncian expresamente a la presentación, protesto, aviso por falta de pago y a cualquier otra formalidad, así como al fuero de su domicilio presente o futuro, sometiéndose a la jurisdicción de los tribunales competentes de {ciudad}.

Quien firma como aval se constituye en obligado solidario del suscriptor por el pago total de este pagaré, sus intereses y accesorios.

Este título será devuelto o cancelado conforme a lo pactado en el contrato de arrendamiento que garantiza.$pag$,
  clauses = (
    SELECT jsonb_agg(
      CASE WHEN c->>'title' LIKE 'QUINTA.%'
        THEN jsonb_build_object(
          'title', 'QUINTA. Depósito en Garantía y Pagaré:',
          'body', $b$• EL ARRENDATARIO entrega a EL ARRENDADOR la cantidad de {deposito} por concepto de depósito en garantía, a la firma del presente contrato.
• El depósito no constituye pago anticipado de rentas ni genera intereses a favor de EL ARRENDATARIO.
• EL ARRENDADOR podrá aplicarlo al pago de rentas vencidas, horas excedentes, combustible faltante, daños al Equipo o gastos de recuperación.
• El remanente será devuelto dentro de los 30 días naturales siguientes a la devolución del Equipo y a la firma de la inspección de retorno sin observaciones pendientes.
• Como garantía adicional, EL ARRENDATARIO suscribe el pagaré que se agrega como Anexo B, el cual garantiza tanto el cumplimiento de las obligaciones de pago como la responsabilidad por daños graves, robo parcial o total o pérdida del Equipo.
• El pagaré será devuelto o destruido por EL ARRENDADOR cada vez que el contrato se renueve, sustituyéndose por uno nuevo, o al término de la vigencia, siempre que el Equipo haya sido devuelto en buenas condiciones y no existan adeudos, daños o faltantes pendientes. La devolución se realizará dentro de los 10 (diez) días hábiles siguientes a la inspección de retorno.$b$
        )
        ELSE c END
      ORDER BY ord
    )
    FROM jsonb_array_elements(contract_templates.clauses) WITH ORDINALITY AS t(c, ord)
  )
WHERE is_default = true;