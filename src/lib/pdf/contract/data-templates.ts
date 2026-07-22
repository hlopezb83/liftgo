import type { ContractClause, ChecklistSection } from "@/features/contracts/lib/contractTypes";

export const DEFAULT_INTRO = 'Contrato de arrendamiento que celebran por una parte {arrendador}, en lo sucesivo "EL ARRENDADOR", y por la otra parte {arrendatario}, en lo sucesivo "EL ARRENDATARIO", de conformidad con las siguientes declaraciones y cláusulas:';

export const DEFAULT_DECL_LANDLORD = [
  "Ser una Persona Moral legalmente constituida bajo las leyes de los Estados Unidos Mexicanos.",
  "Tener la capacidad jurídica y económica para celebrar este contrato.",
  "Ser el legítimo propietario del equipo descrito en este contrato.",
];

export const DEFAULT_DECL_TENANT = [
  "Ser una Persona Moral legalmente constituida, con facultades suficientes para obligarse en los términos de este contrato.",
  "Tener su domicilio legal en: {domicilio_cliente}.",
  "Requerir el equipo única y exclusivamente para maniobras y carga de materiales lícitos dentro de sus instalaciones.",
];

export const DEFAULT_CLAUSES: ContractClause[] = [
  { title: "PRIMERA. Objeto del Contrato:", body: "EL ARRENDADOR otorga en arrendamiento a EL ARRENDATARIO el siguiente equipo:\n• Marca: {marca}\n• Modelo: {modelo}\n• Número de Serie: {serie}\n• Capacidad de Carga: {capacidad}\n• Tipo de Combustible: {combustible}" },
  { title: "SEGUNDA. Lugar y Condiciones de Uso:", body: "• El Equipo será utilizado exclusivamente en: {ubicacion}.\n• Uso máximo: {horas_max} horas/mes. Cargo por hora extra: ${tarifa_extra}.\n• El Equipo no podrá ser trasladado sin consentimiento escrito de EL ARRENDADOR.\n• EL ARRENDATARIO se obliga a que el equipo sea operado por personal capacitado y certificado." },
  { title: "TERCERA. Vigencia:", body: "El plazo del arrendamiento iniciará el {fecha_inicio} y terminará el {fecha_fin}. Al término, EL ARRENDATARIO deberá devolver El Equipo en las mismas condiciones en que lo recibió, salvo desgaste normal." },
  { title: "CUARTA. Precio y Forma de Pago:", body: "• Tarifa diaria: ${tarifa_diaria} | Semanal: ${tarifa_semanal} | Mensual: ${tarifa_mensual} más IVA.\n• Pago: {frecuencia_pago}.\n• Interés moratorio: {interes_moratorio}% mensual sobre saldos insolutos." },
  { title: "QUINTA. Mantenimiento y Reparaciones:", body: "• Mantenimiento Preventivo: A cargo de EL ARRENDADOR.\n• Revisión Diaria (Checklist): A cargo de EL ARRENDATARIO.\n• Mantenimiento Correctivo: Si la falla es por desgaste normal, a cargo de EL ARRENDADOR. Si es por negligencia o mal uso, a cargo de EL ARRENDATARIO al 100%." },
  { title: "SEXTA. Responsabilidad Civil y Riesgos:", body: "• A partir de la entrega material, EL ARRENDATARIO asume el riesgo de pérdida, robo, destrucción o daños.\n• EL ARRENDATARIO exime a EL ARRENDADOR de cualquier responsabilidad civil, penal o laboral derivada de accidentes." },
  { title: "SÉPTIMA. Rescisión:", body: "Son causas de rescisión inmediata sin responsabilidad para EL ARRENDADOR:\n• Falta de pago de una o más rentas.\n• Uso indebido o negligente del equipo.\n• Subarrendamiento no autorizado.\n• Incumplimiento de cualquier cláusula." },
  { title: "OCTAVA. Jurisdicción y Competencia:", body: "Las partes se someten a las leyes aplicables y a los tribunales competentes de Monterrey, Nuevo León, renunciando a cualquier otro fuero." },
];

export const DEFAULT_CHECKLIST: ChecklistSection[] = [
  { title: "II. Niveles y Fluidos", items: ["Aceite del motor", "Aceite hidráulico", "Líquido refrigerante", "Líquido de frenos", "Fugas visibles"] },
  { title: "III. Sistema Mecánico e Hidráulico", items: ["Estado de horquillas", "Funcionamiento del mástil", "Inclinación del mástil", "Desplazador lateral", "Cadenas y poleas"] },
  { title: "IV. Seguridad y Operación", items: ["Cinturón de seguridad", "Claxon", "Alarma de reversa", "Luces delanteras", "Luces traseras", "Torreta estroboscópica", "Espejos retrovisores", "Extintor", "Freno de mano"] },
  { title: "V. Llantas y Tracción", items: ["Llantas delanteras", "Llantas traseras", "Birlos y tuercas"] },
  { title: "VI. Estética", items: ["Asiento del operador", "Tapas y cubiertas", "Pintura y golpes"] },
];

export const DEFAULT_PAGARE = 'Por este PAGARÉ me(nos) obligo(amos) a pagar incondicionalmente a la orden de {arrendador}, en la ciudad de {ciudad}, la cantidad de ${deposito} (Pesos Mexicanos).\n\nSi este pagaré no es cubierto a su vencimiento, causará intereses moratorios a razón del {interes_moratorio}% mensual desde la fecha de su vencimiento y hasta su total liquidación.\n\nTodos los suscriptores y avalistas renuncian al fuero de su domicilio y se someten a la jurisdicción de los tribunales competentes en Monterrey, Nuevo León.';
