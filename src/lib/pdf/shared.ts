import { supabase } from "@/integrations/supabase/client";
import { loadCompanyLogo } from "@/lib/pdf/assets/logo";
import { formatDateDisplay } from "@/lib/utils";

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
  // R-arq 13: columnas explícitas — evita cachear `company_settings` completa
  // (incluye umbrales financieros irrelevantes al PDF y expande la row en cache).
  const { data: company } = await supabase
    .from("company_settings")
    .select("razon_social, rfc, regimen_fiscal, lugar_expedicion, logo_url")
    .limit(1)
    .maybeSingle();

  const logoBase64 = await loadCompanyLogo(company?.logo_url);

  return { company, logoBase64 };
}

// ─── Shared date formatter ────────────────────────────

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  const s = formatDateDisplay(d);
  return s || "—";
}
