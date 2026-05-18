import type { Database } from "@/integrations/supabase/types";
import type { ContractFormShape } from "./contractFormDefaults";
import { toStr } from "@/lib/forms/coerce";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Forklift = Database["public"]["Tables"]["forklifts"]["Row"];
type Company = { razon_social?: string | null } | null | undefined;

interface Args {
  company: Company;
  customer: Customer;
  forklift: Forklift;
  form: ContractFormShape;
}

/**
 * Construye el diccionario de reemplazos para el template de contrato.
 * Separado del hook para mantener complejidad ciclomática baja.
 */
export function buildTemplateReplacements({ company, customer, forklift, form }: Args): Record<string, string> {
  return {
    EMPRESA_ARRENDADOR: toStr(company?.razon_social, "[Nombre de tu empresa]"),
    NOMBRE_CLIENTE: customer.name,
    DOMICILIO_CLIENTE: toStr(customer.address, "[Domicilio del cliente]"),
    MARCA_EQUIPO: toStr(forklift.manufacturer, "—"),
    MODELO_EQUIPO: toStr(forklift.model, "—"),
    SERIE_EQUIPO: toStr(forklift.serial_number, "—"),
    CAPACIDAD_EQUIPO: forklift.capacity_kg ? `${forklift.capacity_kg} kg` : "—",
    COMBUSTIBLE_EQUIPO: toStr(forklift.fuel_type, "—"),
    UBICACION_USO: toStr(form.usage_location, "[Dirección]"),
    HORAS_MAX: toStr(form.max_hours_per_month, "[Número]"),
    TARIFA_HORA_EXTRA: toStr(form.extra_hour_rate, "[Monto]"),
    FECHA_INICIO: toStr(form.start_date, "[Fecha de inicio]"),
    FECHA_FIN: toStr(form.end_date, "[Fecha de término]"),
    MONTO_RENTA: form.monthly_rate || form.weekly_rate || form.daily_rate || "[Monto]",
    FRECUENCIA_PAGO: toStr(form.payment_frequency, "Mensual"),
    INTERES_MORATORIO: toStr(form.late_interest_rate, "5"),
    REPRESENTANTE_LEGAL: toStr(customer.representante_legal),
  };
}
