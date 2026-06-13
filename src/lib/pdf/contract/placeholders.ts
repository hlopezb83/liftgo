import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import type { ContractData } from "./fetchers";

interface CompanyInfo { razon_social?: string | null }
interface CustomerInfo {
  name?: string | null; address?: string | null; rfc?: string | null;
  representante_legal?: string | null;
}
interface ForkliftInfo {
  manufacturer?: string | null; model?: string | null; serial_number?: string | null;
  capacity_kg?: number | null; fuel_type?: string | null;
}

const fmtDate = (d?: string | null) => (d ? (formatDateDisplay(d) || "[Fecha]") : "[Fecha]");
const num = (v: number | string | null | undefined) => Number(v || 0);

function buildPartyVars(contract: ContractData, company: CompanyInfo | null, customer: CustomerInfo | null) {
  return {
    arrendador: company?.razon_social || "[Arrendador]",
    arrendatario: customer?.name || contract.customer_name || "[Arrendatario]",
    domicilio_cliente: customer?.address || "[Domicilio del cliente]",
    rfc_cliente: customer?.rfc || "[RFC]",
    representante_legal: customer?.representante_legal || "[Representante Legal]",
  };
}

function buildUsageVars(contract: ContractData) {
  return {
    ubicacion: contract.usage_location || "[Dirección]",
    horas_max: String(contract.max_hours_per_month || "—"),
    tarifa_extra: formatCurrency(num(contract.extra_hour_rate)),
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
    interes_moratorio: String(contract.late_interest_rate || 5),
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

export function buildPlaceholderVars(
  contract: ContractData,
  company: CompanyInfo | null,
  customer: CustomerInfo | null,
  forklift: ForkliftInfo | null,
): Record<string, string> {
  return {
    ...buildPartyVars(contract, company, customer),
    ...buildUsageVars(contract),
    ...buildPricingVars(contract),
    ...buildEquipmentVars(forklift),
    ciudad: contract.contract_city || "San Pedro Garza García, N.L.",
  };
}
