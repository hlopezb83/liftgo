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
  { key: "{rfc_arrendador}", desc: "RFC de la empresa" },
  { key: "{cp_arrendador}", desc: "C.P. fiscal de la empresa" },
  { key: "{arrendatario}", desc: "Nombre del cliente" },
  { key: "{domicilio_cliente}", desc: "Domicilio del cliente (normalizado, con C.P.)" },
  { key: "{cp_cliente}", desc: "C.P. fiscal del cliente" },
  { key: "{rfc_cliente}", desc: "RFC del cliente" },
  { key: "{representante_legal}", desc: "Rep. legal del cliente" },
  { key: "{ubicacion}", desc: "Ubicación de uso" },
  { key: "{horas_max}", desc: "Horas máximas por mes" },
  { key: "{tarifa_extra}", desc: "Tarifa por hora extra (ya incluye $)" },
  { key: "{fecha_inicio}", desc: "Fecha de inicio" },
  { key: "{fecha_fin}", desc: "Fecha de fin" },
  { key: "{fecha_firma}", desc: "Fecha de firma del contrato" },
  { key: "{vencimiento_pagare}", desc: "Vencimiento del pagaré (fin de vigencia)" },
  { key: "{tarifa_diaria}", desc: "Tarifa diaria (ya incluye $)" },
  { key: "{tarifa_semanal}", desc: "Tarifa semanal (ya incluye $)" },
  { key: "{tarifa_mensual}", desc: "Tarifa mensual (ya incluye $)" },
  { key: "{deposito}", desc: "Monto del depósito (ya incluye $)" },
  { key: "{monto_pagare}", desc: "Monto del pagaré: costo de adquisición del equipo (ya incluye $)" },
  { key: "{interes_moratorio}", desc: "Tasa de interés moratorio" },
  { key: "{frecuencia_pago}", desc: "Frecuencia de pago" },
  { key: "{marca}", desc: "Marca del equipo" },
  { key: "{modelo}", desc: "Modelo del equipo" },
  { key: "{serie}", desc: "Número de serie" },
  { key: "{capacidad}", desc: "Capacidad de carga" },
  { key: "{combustible}", desc: "Tipo de combustible" },
  { key: "{ciudad}", desc: "Ciudad del contrato" },
  { key: "{firmado_por}", desc: "Persona que firma por el cliente (campo \"Firmado por\")" },
] as const;
