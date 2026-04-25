import { supabase } from "@/integrations/supabase/client";
import { loadImageAsBase64 } from "@/lib/pdf/loadImageAsBase64";
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

// ─── PDF text helpers (shared across contract/quote/invoice PDFs) ──

export function addWrappedText(doc: any, text: string, x: number, cursorY: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  let y = cursorY;
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = 20; }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function checkPage(doc: any, cursorY: number, needed: number = 15): number {
  if (cursorY + needed > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); return 20; }
  return cursorY;
}

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return "—"; }
}
