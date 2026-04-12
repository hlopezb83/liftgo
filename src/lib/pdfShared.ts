import { supabase } from "@/integrations/supabase/client";
import { loadImageAsBase64 } from "@/lib/loadImageAsBase64";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────

export interface PdfLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  discount_type?: "%" | "$";
}

export interface CompanyData {
  razon_social: string;
  rfc: string;
  regimen_fiscal: string;
  lugar_expedicion: string;
  logo_url: string | null;
}

// ─── Fetch company data + logo ────────────────────────

export async function fetchCompanyDataAndLogo(): Promise<{
  company: CompanyData | null;
  logoBase64: string | null;
}> {
  const { data: company } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  let logoBase64: string | null = null;
  if (company?.logo_url) {
    logoBase64 = await loadImageAsBase64(company.logo_url);
  }

  return { company, logoBase64 };
}

// ─── Shared date formatter ────────────────────────────

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return "—"; }
}
