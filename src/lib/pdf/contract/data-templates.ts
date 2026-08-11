import type { ContractClause, ChecklistSection } from "@/lib/domain/contractTypes";

export const DEFAULT_INTRO = 'Contrato de arrendamiento que celebran por una parte {arrendador}, con Registro Federal de Contribuyentes {rfc_arrendador}, en lo sucesivo "EL ARRENDADOR", y por la otra parte {arrendatario}, con Registro Federal de Contribuyentes {rfc_cliente}, en lo sucesivo "EL ARRENDATARIO", de conformidad con las siguientes declaraciones y cláusulas:';

export const DEFAULT_DECL_LANDLORD = [
  "Ser una Persona Moral legalmente constituida bajo las leyes de los Estados Unidos Mexicanos, con RFC {rfc_arrendador} y domicilio fiscal en C.P. {cp_arrendador}.",
  "Tener la capacidad jurídica y económica para celebrar este contrato.",
  "Ser el legítimo propietario del equipo descrito en este contrato.",
];

export const DEFAULT_DECL_TENANT = [
  "Ser una Persona Moral legalmente constituida, con facultades suficientes para obligarse en los términos de este contrato, con RFC {rfc_cliente}.",
  "Tener su domicilio legal en: {domicilio_cliente}.",
  "Requerir el equipo única y exclusivamente para maniobras y carga de materiales lícitos dentro de sus instalaciones.",
];

export const DEFAULT_CLAUSES: ContractClause[] = [
  { title: "PRIMERA. Objeto del Contrato:", body: "EL ARRENDADOR otorga en arrendamiento a EL ARRENDATARIO el siguiente equipo:\n• Marca: {marca}\n• Modelo: {modelo}\n• Número de Serie: {serie}\n• Capacidad de Carga: {capacidad}\n• Tipo de Combustible: {combustible}" },
  { title: "SEGUNDA. Lugar y Condiciones de Uso:", body: "• El Equipo será utilizado exclusivamente en: {ubicacion}.\n• Uso máximo: {horas_max} horas/mes. Cargo por hora extra: {tarifa_extra}.\n• El Equipo no podrá ser trasladado sin consentimiento escrito de EL ARRENDADOR.\n• EL ARRENDATARIO se obliga a que el equipo sea operado por personal capacitado y certificado." },
  { title: "TERCERA. Vigencia:", body: "El plazo del arrendamiento iniciará el {fecha_inicio} y terminará el {fecha_fin}. Al término, EL ARRENDATARIO deberá devolver El Equipo en las mismas condiciones en que lo recibió, salvo desgaste normal." },
  { title: "CUARTA. Precio y Forma de Pago:", body: "• Tarifa diaria: {tarifa_diaria} | Semanal: {tarifa_semanal} | Mensual: {tarifa_mensual} más IVA.\n• Pago: {frecuencia_pago}.\n• Interés moratorio: {interes_moratorio}% mensual sobre saldos insolutos." },
  { title: "QUINTA. Depósito en Garantía:", body: "• EL ARRENDATARIO entrega a EL ARRENDADOR la cantidad de {deposito} por concepto de depósito en garantía, a la firma del presente contrato.\n• El depósito no constituye pago anticipado de rentas ni genera intereses a favor de EL ARRENDATARIO.\n• EL ARRENDADOR podrá aplicarlo al pago de rentas vencidas, horas excedentes, combustible faltante, daños al Equipo o gastos de recuperación.\n• El remanente será devuelto dentro de los 30 días naturales siguientes a la devolución del Equipo y a la firma de la inspección de retorno sin observaciones pendientes.\n• Como garantía adicional, EL ARRENDATARIO suscribe el pagaré que se agrega como Anexo B." },
  { title: "SEXTA. Mantenimiento y Reparaciones:", body: "• Mantenimiento Preventivo: A cargo de EL ARRENDADOR.\n• Revisión Diaria (Checklist): A cargo de EL ARRENDATARIO.\n• Mantenimiento Correctivo: Si la falla es por desgaste normal, a cargo de EL ARRENDADOR. Si es por negligencia o mal uso, a cargo de EL ARRENDATARIO al 100%." },
  { title: "SÉPTIMA. Entrega, Devolución y Maniobras:", body: "• La entrega y la devolución del Equipo se documentan mediante el checklist del Anexo A, firmado por ambas partes.\n• Los costos de flete, maniobras de carga y descarga corren por cuenta de EL ARRENDATARIO, salvo pacto expreso por escrito.\n• El Equipo deberá devolverse con el mismo nivel de combustible y horómetro documentado en la entrega; las diferencias se facturarán por separado." },
  { title: "OCTAVA. Seguro y Responsabilidad Civil:", body: "• A partir de la entrega material, EL ARRENDATARIO asume el riesgo de pérdida, robo, destrucción o daños del Equipo.\n• EL ARRENDATARIO se obliga a mantener vigente, durante la vigencia del contrato, un seguro de responsabilidad civil que ampare daños a terceros derivados de la operación del Equipo, y a exhibirlo a solicitud de EL ARRENDADOR.\n• EL ARRENDATARIO exime a EL ARRENDADOR de cualquier responsabilidad civil, penal o laboral derivada de accidentes ocurridos durante la operación del Equipo." },
  { title: "NOVENA. Facturación y Notificaciones:", body: "• Las rentas se facturan mediante CFDI 4.0 vigente, más el IVA correspondiente, a los datos fiscales manifestados por EL ARRENDATARIO.\n• EL ARRENDATARIO se obliga a informar por escrito cualquier cambio en sus datos fiscales dentro de los 5 días hábiles siguientes.\n• Las notificaciones entre las partes serán válidas en los domicilios señalados en las declaraciones de este contrato." },
  { title: "DÉCIMA. Rescisión:", body: "Son causas de rescisión inmediata sin responsabilidad para EL ARRENDADOR:\n• Falta de pago de una o más rentas.\n• Uso indebido o negligente del equipo.\n• Subarrendamiento no autorizado.\n• Incumplimiento de cualquier cláusula." },
  { title: "DÉCIMA PRIMERA. Jurisdicción y Competencia:", body: "Las partes se someten a las leyes aplicables y a los tribunales competentes de Monterrey, Nuevo León, renunciando a cualquier otro fuero." },
];

export const DEFAULT_CHECKLIST: ChecklistSection[] = [
  { title: "II. Niveles y Fluidos", items: ["Aceite del motor", "Aceite hidráulico", "Líquido refrigerante", "Líquido de frenos", "Fugas visibles"] },
  { title: "III. Sistema Mecánico e Hidráulico", items: ["Estado de horquillas", "Funcionamiento del mástil", "Inclinación del mástil", "Desplazador lateral", "Cadenas y poleas"] },
  { title: "IV. Seguridad y Operación", items: ["Cinturón de seguridad", "Claxon", "Alarma de reversa", "Luces delanteras", "Luces traseras", "Torreta estroboscópica", "Espejos retrovisores", "Extintor", "Freno de mano"] },
  { title: "V. Llantas y Tracción", items: ["Llantas delanteras", "Llantas traseras", "Birlos y tuercas"] },
  { title: "VI. Estética", items: ["Asiento del operador", "Tapas y cubiertas", "Pintura y golpes"] },
];

export const DEFAULT_PAGARE = 'Por este PAGARÉ me(nos) obligo(amos) a pagar incondicionalmente a la orden de {arrendador}, en la ciudad de {ciudad}, el día {vencimiento_pagare}, la cantidad de {monto_pagare} (Pesos Mexicanos).\n\nSi este pagaré no es cubierto a su vencimiento, causará intereses moratorios a razón del {interes_moratorio}% mensual desde la fecha de su vencimiento y hasta su total liquidación.\n\nTodos los suscriptores y avalistas renuncian al fuero de su domicilio y se someten a la jurisdicción de los tribunales competentes en Monterrey, Nuevo León.';
