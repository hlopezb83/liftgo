
-- Add new columns to contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS usage_location text,
  ADD COLUMN IF NOT EXISTS max_hours_per_month numeric,
  ADD COLUMN IF NOT EXISTS extra_hour_rate numeric,
  ADD COLUMN IF NOT EXISTS payment_frequency text DEFAULT 'Mensual',
  ADD COLUMN IF NOT EXISTS late_interest_rate numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS contract_city text DEFAULT 'San Pedro Garza García, N.L.',
  ADD COLUMN IF NOT EXISTS witness_1 text,
  ADD COLUMN IF NOT EXISTS witness_2 text;

-- Create contract_templates table
CREATE TABLE public.contract_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  body_text text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

-- Read for all authenticated users
CREATE POLICY "Authenticated read contract_templates"
  ON public.contract_templates FOR SELECT
  USING (true);

-- Write only for admins
CREATE POLICY "Admins write contract_templates"
  ON public.contract_templates FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update contract_templates"
  ON public.contract_templates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete contract_templates"
  ON public.contract_templates FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default template
INSERT INTO public.contract_templates (name, body_text, is_default) VALUES (
  'Contrato de Arrendamiento Estándar',
  E'CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO\n\nContrato de arrendamiento que celebran por una parte [EMPRESA_ARRENDADOR], en lo sucesivo "EL ARRENDADOR", y por la otra parte [NOMBRE_CLIENTE], en lo sucesivo "EL ARRENDATARIO", de conformidad con las siguientes declaraciones y cláusulas:\n\nI. DECLARACIONES\n\nDeclara EL ARRENDADOR:\n• Ser una Persona Moral legalmente constituida bajo las leyes de los Estados Unidos Mexicanos.\n• Tener la capacidad jurídica y económica para celebrar este contrato.\n• Ser el legítimo propietario del equipo descrito en este contrato.\n\nDeclara EL ARRENDATARIO:\n• Ser una Persona Moral legalmente constituida, con facultades suficientes para obligarse en los términos de este contrato.\n• Tener su domicilio legal en: [DOMICILIO_CLIENTE].\n• Requerir el equipo única y exclusivamente para maniobras y carga de materiales lícitos dentro de sus instalaciones.\n\nII. CLÁUSULAS\n\nPRIMERA. Objeto del Contrato:\nEL ARRENDADOR otorga en arrendamiento a EL ARRENDATARIO el siguiente equipo (en adelante "El Equipo"):\n• Marca: [MARCA_EQUIPO]\n• Modelo: [MODELO_EQUIPO]\n• Número de Serie: [SERIE_EQUIPO]\n• Capacidad de Carga: [CAPACIDAD_EQUIPO]\n• Tipo de Combustible/Energía: [COMBUSTIBLE_EQUIPO]\n\nSEGUNDA. Lugar y Condiciones de Uso:\n• El Equipo será utilizado exclusivamente en las instalaciones ubicadas en: [UBICACION_USO].\n• El uso máximo permitido para El Equipo será de [HORAS_MAX] horas por mes. En caso de exceder este límite, EL ARRENDATARIO se obliga a pagar a EL ARRENDADOR un cargo adicional por hora extra equivalente a $[TARIFA_HORA_EXTRA] por cada hora o fracción excedida.\n• El Equipo no podrá ser trasladado a otra ubicación sin el consentimiento previo y por escrito de EL ARRENDADOR.\n• EL ARRENDATARIO se obliga a que el equipo sea operado únicamente por personal debidamente capacitado y certificado.\n\nTERCERA. Vigencia:\nEl plazo del arrendamiento iniciará el [FECHA_INICIO] y terminará el [FECHA_FIN].\nAl término del contrato, EL ARRENDATARIO deberá devolver El Equipo en las mismas condiciones mecánicas y estéticas en que lo recibió, salvo el desgaste por uso normal.\n\nCUARTA. Precio y Forma de Pago:\n• EL ARRENDATARIO pagará a EL ARRENDADOR la cantidad de $[MONTO_RENTA] más el Impuesto al Valor Agregado (IVA) aplicable.\n• El pago se realizará de forma [FRECUENCIA_PAGO].\n• En caso de mora, se aplicará un interés moratorio del [INTERES_MORATORIO]% mensual sobre los saldos insolutos.\n\nQUINTA. Mantenimiento y Reparaciones:\n• Mantenimiento Preventivo: Estará a cargo de EL ARRENDADOR. EL ARRENDATARIO debe permitir el acceso al personal técnico en horarios hábiles para realizar estos servicios.\n• Revisión Diaria (Checklist): Estará a cargo de EL ARRENDATARIO, revisando niveles de fluidos, presión de llantas y estado general antes de cada turno.\n• Mantenimiento Correctivo: Si la falla deriva del desgaste normal, el costo será de EL ARRENDADOR. Si la avería es por negligencia, mal uso o accidente por parte de EL ARRENDATARIO, este último cubrirá el 100% del costo de reparación y refacciones.\n\nSEXTA. Responsabilidad Civil y Riesgos:\n• A partir de la entrega material, EL ARRENDATARIO asume el riesgo de pérdida, robo, destrucción o daños a El Equipo.\n• EL ARRENDATARIO exime a EL ARRENDADOR de cualquier responsabilidad civil, penal o laboral derivada de accidentes que involucren El Equipo durante la vigencia del arrendamiento.\n\nSÉPTIMA. Rescisión:\nSon causas de rescisión inmediata sin responsabilidad para EL ARRENDADOR:\n• Falta de pago de una o más rentas.\n• Uso indebido o negligente del equipo.\n• Subarrendamiento no autorizado.\n• Incumplimiento de cualquier cláusula de este contrato.\n\nOCTAVA. Jurisdicción y Competencia:\nPara la interpretación y cumplimiento de este contrato, las partes se someten expresamente a las leyes aplicables y a los tribunales competentes de la ciudad de Monterrey, Nuevo León, renunciando a cualquier otro fuero que pudiera corresponderles.',
  true
);
