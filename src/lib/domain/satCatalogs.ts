/** SAT CFDI 4.0 catalog constants for dropdown menus */

export const REGIMEN_FISCAL = [
  { code: "601", label: "601 - General de Ley Personas Morales" },
  { code: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "605 - Sueldos y Salarios" },
  { code: "606", label: "606 - Arrendamiento" },
  { code: "608", label: "608 - Demás ingresos" },
  { code: "610", label: "610 - Residentes en el Extranjero" },
  { code: "612", label: "612 - Personas Físicas con Actividades Empresariales y Profesionales" },
  { code: "614", label: "614 - Ingresos por Intereses" },
  { code: "616", label: "616 - Sin obligaciones fiscales" },
  { code: "620", label: "620 - Sociedades Cooperativas de Producción" },
  { code: "621", label: "621 - Incorporación Fiscal" },
  { code: "622", label: "622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { code: "623", label: "623 - Opcional para Grupos de Sociedades" },
  { code: "624", label: "624 - Coordinados" },
  { code: "625", label: "625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { code: "626", label: "626 - Régimen Simplificado de Confianza" },
] as const;

export const USO_CFDI = [
  { code: "G01", label: "G01 - Adquisición de mercancías" },
  { code: "G02", label: "G02 - Devoluciones, descuentos o bonificaciones" },
  { code: "G03", label: "G03 - Gastos en general" },
  { code: "I01", label: "I01 - Construcciones" },
  { code: "I02", label: "I02 - Mobiliario y equipo de oficina" },
  { code: "I03", label: "I03 - Equipo de transporte" },
  { code: "I04", label: "I04 - Equipo de cómputo" },
  { code: "I08", label: "I08 - Otra maquinaria y equipo" },
  { code: "P01", label: "P01 - Por definir" },
  { code: "S01", label: "S01 - Sin efectos fiscales" },
  { code: "CP01", label: "CP01 - Pagos" },
] as const;

export const FORMA_PAGO = [
  { code: "01", label: "01 - Efectivo" },
  { code: "02", label: "02 - Cheque nominativo" },
  { code: "03", label: "03 - Transferencia electrónica de fondos" },
  { code: "04", label: "04 - Tarjeta de crédito" },
  { code: "05", label: "05 - Monedero electrónico" },
  { code: "06", label: "06 - Dinero electrónico" },
  { code: "28", label: "28 - Tarjeta de débito" },
  { code: "29", label: "29 - Tarjeta de servicios" },
  { code: "99", label: "99 - Por definir" },
] as const;

export const METODO_PAGO = [
  { code: "PUE", label: "PUE - Pago en una sola exhibición" },
  { code: "PPD", label: "PPD - Pago en parcialidades o diferido" },
] as const;

export const MONEDA = [
  { code: "MXN", label: "MXN - Peso Mexicano" },
  { code: "USD", label: "USD - Dólar Americano" },
  { code: "EUR", label: "EUR - Euro" },
] as const;

/** Common SAT product/service codes for equipment rental */
export const CLAVE_PROD_SERV = [
  { code: "78181500", label: "78181500 - Alquiler de equipo de manejo de materiales" },
  { code: "78181501", label: "78181501 - Alquiler de montacargas" },
  { code: "78181600", label: "78181600 - Alquiler de equipo de transporte" },
  { code: "81141601", label: "81141601 - Servicios de entrega" },
  { code: "80131500", label: "80131500 - Alquiler de propiedades o edificaciones" },
  { code: "81112100", label: "81112100 - Servicios de mantenimiento de equipo" },
] as const;

export const CLAVE_UNIDAD = [
  { code: "E48", label: "E48 - Unidad de servicio" },
  { code: "DAY", label: "DAY - Día" },
  { code: "WEE", label: "WEE - Semana" },
  { code: "MON", label: "MON - Mes" },
  { code: "HUR", label: "HUR - Hora" },
  { code: "ACT", label: "ACT - Actividad" },
] as const;

export const CANCELLATION_REASONS = [
  { code: "01", label: "01 - Comprobante emitido con errores con relación" },
  { code: "02", label: "02 - Comprobante emitido con errores sin relación" },
  { code: "03", label: "03 - No se llevó a cabo la operación" },
  { code: "04", label: "04 - Operación nominativa relacionada en la factura global" },
] as const;
