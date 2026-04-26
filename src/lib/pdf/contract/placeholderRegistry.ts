/**
 * Registro único de placeholders disponibles en plantillas de contrato.
 * Consumido por:
 *   - ContractTemplateTab.tsx → muestra la lista al editar la plantilla.
 *   - placeholders.ts (buildPlaceholderVars) → resuelve cada token al generar el PDF.
 */
export interface ContractPlaceholder {
  key: string;
  desc: string;
}

export const CONTRACT_PLACEHOLDERS: readonly ContractPlaceholder[] = [
  { key: "{arrendador}", desc: "Razón social de la empresa" },
  { key: "{arrendatario}", desc: "Nombre del cliente" },
  { key: "{domicilio_cliente}", desc: "Domicilio del cliente" },
  { key: "{rfc_cliente}", desc: "RFC del cliente" },
  { key: "{representante_legal}", desc: "Rep. legal del cliente" },
  { key: "{ubicacion}", desc: "Ubicación de uso" },
  { key: "{horas_max}", desc: "Horas máximas por mes" },
  { key: "{tarifa_extra}", desc: "Tarifa por hora extra" },
  { key: "{fecha_inicio}", desc: "Fecha de inicio" },
  { key: "{fecha_fin}", desc: "Fecha de fin" },
  { key: "{tarifa_diaria}", desc: "Tarifa diaria" },
  { key: "{tarifa_semanal}", desc: "Tarifa semanal" },
  { key: "{tarifa_mensual}", desc: "Tarifa mensual" },
  { key: "{deposito}", desc: "Monto del depósito" },
  { key: "{interes_moratorio}", desc: "Tasa de interés moratorio" },
  { key: "{frecuencia_pago}", desc: "Frecuencia de pago" },
  { key: "{marca}", desc: "Marca del equipo" },
  { key: "{modelo}", desc: "Modelo del equipo" },
  { key: "{serie}", desc: "Número de serie" },
  { key: "{capacidad}", desc: "Capacidad de carga" },
  { key: "{combustible}", desc: "Tipo de combustible" },
  { key: "{ciudad}", desc: "Ciudad del contrato" },
] as const;
