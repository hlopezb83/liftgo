import { supabase } from "@/integrations/supabase/client";
import type { ContractClause, ChecklistSection } from "@/lib/domain/contractTypes";
import { parseJsonbArray } from "@/lib/domain/lineItems";
import { loadCompanyLogo } from "@/lib/pdf/assets/logo";
import {
  DEFAULT_INTRO, DEFAULT_DECL_LANDLORD, DEFAULT_DECL_TENANT,
  DEFAULT_CLAUSES, DEFAULT_CHECKLIST, DEFAULT_PAGARE,
} from "@/lib/pdf/contract/data-templates";
import type { ContractViewModel } from "@/types/rental";

export type ContractData = Pick<ContractViewModel,
  | "contract_number" | "customer_id" | "forklift_id" | "start_date" | "end_date"
  | "daily_rate" | "weekly_rate" | "monthly_rate" | "deposit_amount" | "terms_text"
  | "status" | "signed_at" | "signed_by" | "usage_location" | "max_hours_per_month"
  | "extra_hour_rate" | "payment_frequency" | "late_interest_rate" | "contract_city"
  | "witness_1" | "witness_2"
> & {
  customer_name?: string | null;
  /**
   * A6R2-3: copia inmutable capturada al firmar (cliente, unidad y plantilla).
   * Cuando existe, el PDF del contrato firmado se rinde desde aquí para que no
   * cambie si después se editan el cliente, la unidad o la plantilla.
   */
  signed_snapshot?: unknown;
};

interface SignedSnapshot {
  customer?: Record<string, unknown> | null;
  forklift?: Record<string, unknown> | null;
  template?: Partial<TemplateData> | null;
}

/** Devuelve el snapshot del contrato firmado, o null si no aplica. */
export function readSignedSnapshot(contract: ContractData): SignedSnapshot | null {
  if (contract.status !== "signed") return null;
  const snap = contract.signed_snapshot;
  if (!snap || typeof snap !== "object") return null;
  return snap as SignedSnapshot;
}

export interface TemplateData {
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
}

export async function fetchRelatedData(contract: ContractData) {
  // A6R2-3: contrato firmado con snapshot → cliente y unidad desde la copia.
  const snapshot = readSignedSnapshot(contract);
  // R-arq 13: columnas explícitas por PDF renderer (evita traer campos ocultos
  // como notes internos, PII bancaria o umbrales financieros al bundle).
  const [companyRes, customerRes, forkliftRes] = await Promise.all([
    supabase
      .from("company_settings")
      .select("razon_social, rfc, regimen_fiscal, lugar_expedicion, logo_url")
      .limit(1)
      .maybeSingle(),
    snapshot?.customer
      ? Promise.resolve({ data: snapshot.customer })
      : contract.customer_id
      ? supabase
          .from("customers")
          .select("name, rfc, address, contact_person, representante_legal, domicilio_fiscal_cp")
          .eq("id", contract.customer_id)
          .single()
      : Promise.resolve({ data: null }),
    snapshot?.forklift
      ? Promise.resolve({ data: snapshot.forklift })
      : contract.forklift_id
      ? supabase
          .from("forklifts")
          .select("manufacturer, model, serial_number, capacity_kg, fuel_type, acquisition_cost")
          .eq("id", contract.forklift_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  return { company: companyRes.data, customer: customerRes.data, forklift: forkliftRes.data };
}



export async function fetchTemplate(): Promise<TemplateData> {
  // v7.282.0: orden explícito — si existiera más de una plantilla marcada como
  // predeterminada, gana la editada más recientemente (antes era arbitrario).
  const { data } = await supabase
    .from("contract_templates")
    .select("intro_text, declarations_landlord, declarations_tenant, clauses, checklist_sections, pagare_text, updated_at")
    .eq("is_default", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();


  if (!data) {
    return {
      intro_text: DEFAULT_INTRO, declarations_landlord: DEFAULT_DECL_LANDLORD,
      declarations_tenant: DEFAULT_DECL_TENANT, clauses: DEFAULT_CLAUSES,
      checklist_sections: DEFAULT_CHECKLIST, pagare_text: DEFAULT_PAGARE,
    };
  }

  const declLandlord = parseJsonbArray<string>(data.declarations_landlord);
  const declTenant = parseJsonbArray<string>(data.declarations_tenant);
  const clauses = parseJsonbArray<ContractClause>(data.clauses);
  const checklist = parseJsonbArray<ChecklistSection>(data.checklist_sections);

  return {
    intro_text: (data.intro_text as string) || DEFAULT_INTRO,
    declarations_landlord: declLandlord.length ? declLandlord : DEFAULT_DECL_LANDLORD,
    declarations_tenant: declTenant.length ? declTenant : DEFAULT_DECL_TENANT,
    clauses: clauses.length ? clauses : DEFAULT_CLAUSES,
    checklist_sections: checklist.length ? checklist : DEFAULT_CHECKLIST,
    pagare_text: (data.pagare_text as string) || DEFAULT_PAGARE,
  };
}

/**
 * @deprecated Usar `loadCompanyLogo` desde `@/lib/pdf/assets/logo`.
 * Se mantiene como thin wrapper para compatibilidad del builder de contrato.
 */
export async function fetchLogoBase64(logoUrl: string | null | undefined): Promise<string | null> {
  return loadCompanyLogo(logoUrl);
}
