import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { loadImageAsBase64 } from "@/lib/loadImageAsBase64";
import type { ContractClause, ChecklistSection } from "@/hooks/useContractTemplates";
import {
  DEFAULT_INTRO, DEFAULT_DECL_LANDLORD, DEFAULT_DECL_TENANT,
  DEFAULT_CLAUSES, DEFAULT_CHECKLIST, DEFAULT_PAGARE,
} from "@/lib/contractPdfData";
import type { ContractViewModel } from "@/types/rental";

// --- Types ---
export type ContractData = Pick<ContractViewModel,
  | "contract_number" | "customer_id" | "forklift_id" | "start_date" | "end_date"
  | "daily_rate" | "weekly_rate" | "monthly_rate" | "deposit_amount" | "terms_text"
  | "status" | "signed_at" | "signed_by" | "usage_location" | "max_hours_per_month"
  | "extra_hour_rate" | "payment_frequency" | "late_interest_rate" | "contract_city"
  | "witness_1" | "witness_2"
> & { customer_name?: string | null };

export interface TemplateData {
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
}

export function buildPlaceholderVars(contract: ContractData, company: any, customer: any, forklift: any): Record<string, string> {
  return {
    arrendador: company?.razon_social || "[Arrendador]",
    arrendatario: customer?.name || contract.customer_name || "[Arrendatario]",
    domicilio_cliente: customer?.address || "[Domicilio del cliente]",
    rfc_cliente: customer?.rfc || "[RFC]",
    representante_legal: customer?.representante_legal || "[Representante Legal]",
    ubicacion: contract.usage_location || "[Dirección]",
    horas_max: String(contract.max_hours_per_month || "—"),
    tarifa_extra: formatCurrency(Number(contract.extra_hour_rate || 0)),
    fecha_inicio: contract.start_date ? format(parseISO(contract.start_date), "dd/MM/yyyy") : "[Fecha]",
    fecha_fin: contract.end_date ? format(parseISO(contract.end_date), "dd/MM/yyyy") : "[Fecha]",
    tarifa_diaria: formatCurrency(Number(contract.daily_rate || 0)),
    tarifa_semanal: formatCurrency(Number(contract.weekly_rate || 0)),
    tarifa_mensual: formatCurrency(Number(contract.monthly_rate || 0)),
    deposito: formatCurrency(Number(contract.deposit_amount || 0)),
    interes_moratorio: String(contract.late_interest_rate || 5),
    frecuencia_pago: contract.payment_frequency || "Mensual",
    marca: forklift?.manufacturer || "—",
    modelo: forklift?.model || "—",
    serie: forklift?.serial_number || "—",
    capacidad: forklift?.capacity_kg ? forklift.capacity_kg + " kg" : "—",
    combustible: forklift?.fuel_type || "—",
    ciudad: contract.contract_city || "San Pedro Garza García, N.L.",
  };
}

// --- Fetch helpers ---
export async function fetchRelatedData(contract: ContractData) {
  const [companyRes, customerRes, forkliftRes] = await Promise.all([
    supabase.from("company_settings").select("*").limit(1).maybeSingle(),
    contract.customer_id
      ? supabase.from("customers").select("*").eq("id", contract.customer_id).single()
      : Promise.resolve({ data: null }),
    contract.forklift_id
      ? supabase.from("forklifts").select("*").eq("id", contract.forklift_id).single()
      : Promise.resolve({ data: null }),
  ]);
  return { company: companyRes.data, customer: customerRes.data, forklift: forkliftRes.data };
}

export async function fetchTemplate(): Promise<TemplateData> {
  const { data } = await supabase
    .from("contract_templates")
    .select("intro_text, declarations_landlord, declarations_tenant, clauses, checklist_sections, pagare_text")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      intro_text: DEFAULT_INTRO, declarations_landlord: DEFAULT_DECL_LANDLORD,
      declarations_tenant: DEFAULT_DECL_TENANT, clauses: DEFAULT_CLAUSES,
      checklist_sections: DEFAULT_CHECKLIST, pagare_text: DEFAULT_PAGARE,
    };
  }

  return {
    intro_text: (data.intro_text as string) || DEFAULT_INTRO,
    declarations_landlord: ((data.declarations_landlord as unknown as string[])?.length ? data.declarations_landlord as unknown as string[] : DEFAULT_DECL_LANDLORD),
    declarations_tenant: ((data.declarations_tenant as unknown as string[])?.length ? data.declarations_tenant as unknown as string[] : DEFAULT_DECL_TENANT),
    clauses: ((data.clauses as unknown as ContractClause[])?.length ? data.clauses as unknown as ContractClause[] : DEFAULT_CLAUSES),
    checklist_sections: ((data.checklist_sections as unknown as ChecklistSection[])?.length ? data.checklist_sections as unknown as ChecklistSection[] : DEFAULT_CHECKLIST),
    pagare_text: (data.pagare_text as string) || DEFAULT_PAGARE,
  };
}

export async function fetchLogoBase64(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  return loadImageAsBase64(logoUrl);
}
