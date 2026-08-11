import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatLegalAddress } from "@/lib/format/formatLegalAddress";
import { formatDateDisplay } from "@/lib/utils";
import type { ContractData } from "./fetchers";

interface CompanyInfo {
  razon_social?: string | null;
  rfc?: string | null;
  lugar_expedicion?: string | null;
}
interface CustomerInfo {
  name?: string | null; address?: string | null; rfc?: string | null;
  representante_legal?: string | null; domicilio_fiscal_cp?: string | null;
}
interface ForkliftInfo {
  manufacturer?: string | null; model?: string | null; serial_number?: string | null;
  capacity_kg?: number | null; fuel_type?: string | null;
  acquisition_cost?: number | null;
}

const fmtDate = (d?: string | null) => (d ? (formatDateDisplay(d) || "[Fecha]") : "[Fecha]");
const num = (v: number | string | null | undefined) => Number(v || 0);
/** v7.302.1: respeta el 0 capturado (antes `|| fallback` lo trataba como vacío). */
const numOr = (v: number | null | undefined, fallback: number): number => (v == null ? fallback : v);

/**
 * v7.282.0: el domicilio del cliente se normaliza (limpia relleno del catálogo
 * SAT y agrega C.P.) antes de imprimirse en el contrato y el pagaré.
 */
export function customerLegalAddress(customer: CustomerInfo | null): string {
  return formatLegalAddress(customer?.address, { cp: customer?.domicilio_fiscal_cp });
}

/** Placeholder por defecto cuando el dato legal no está capturado. */
const orDash = (v: string | null | undefined, fallback: string) => v || fallback;

function buildLessorVars(company: CompanyInfo | null) {
  return {
    arrendador: orDash(company?.razon_social, "[Arrendador]"),
    rfc_arrendador: orDash(company?.rfc, "[RFC del arrendador]"),
    cp_arrendador: orDash(company?.lugar_expedicion, "—"),
  };
}

function buildLesseeVars(contract: ContractData, customer: CustomerInfo | null) {
  return {
    arrendatario: orDash(customer?.name || contract.customer_name, "[Arrendatario]"),
    domicilio_cliente: orDash(customerLegalAddress(customer), "[Domicilio del cliente]"),
    cp_cliente: orDash(customer?.domicilio_fiscal_cp, "—"),
    rfc_cliente: orDash(customer?.rfc, "[RFC]"),
    representante_legal: orDash(customer?.representante_legal, "[Representante Legal]"),
  };
}

function buildPartyVars(contract: ContractData, company: CompanyInfo | null, customer: CustomerInfo | null) {
  return { ...buildLessorVars(company), ...buildLesseeVars(contract, customer) };
}


function buildUsageVars(contract: ContractData) {
  return {
    ubicacion: contract.usage_location || "[Dirección]",
    horas_max: contract.max_hours_per_month == null ? "—" : String(contract.max_hours_per_month),
    tarifa_extra: formatCurrency(contract.extra_hour_rate ?? 0),
    fecha_inicio: fmtDate(contract.start_date),
    fecha_fin: fmtDate(contract.end_date),
  };
}

function buildPricingVars(contract: ContractData) {
  return {
    tarifa_diaria: formatCurrency(num(contract.daily_rate)),
    tarifa_semanal: formatCurrency(num(contract.weekly_rate)),
    tarifa_mensual: formatCurrency(num(contract.monthly_rate)),
    deposito: formatCurrency(num(contract.deposit_amount)),
    interes_moratorio: String(numOr(contract.late_interest_rate, 5)),
    frecuencia_pago: contract.payment_frequency || "Mensual",
  };
}

function buildEquipmentVars(forklift: ForkliftInfo | null) {
  return {
    marca: forklift?.manufacturer || "—",
    modelo: forklift?.model || "—",
    serie: forklift?.serial_number || "—",
    capacidad: forklift?.capacity_kg ? `${forklift.capacity_kg} kg` : "—",
    combustible: forklift?.fuel_type || "—",
  };
}

/**
 * Fecha de firma del contrato: la registrada al firmar; si no existe, la fecha
 * de inicio de vigencia. Nunca "hoy" al momento de descargar el PDF.
 */
export function contractSigningDate(contract: ContractData): string | null {
  return contract.signed_at || contract.start_date || null;
}

export function buildPlaceholderVars(
  contract: ContractData,
  company: CompanyInfo | null,
  customer: CustomerInfo | null,
  forklift: ForkliftInfo | null,
): Record<string, string> {
  const signing = contractSigningDate(contract);
  return {
    ...buildPartyVars(contract, company, customer),
    ...buildUsageVars(contract),
    ...buildPricingVars(contract),
    ...buildEquipmentVars(forklift),
    firmado_por: contract.signed_by || "",
    ciudad: contract.contract_city || "San Pedro Garza García, N.L.",
    fecha_firma: signing ? fmtDate(signing) : "[Fecha de firma]",
    vencimiento_pagare: fmtDate(contract.end_date),
  };
}
