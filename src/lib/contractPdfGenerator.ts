import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { loadImageAsBase64 } from "@/lib/loadImageAsBase64";
import type { ContractClause, ChecklistSection } from "@/hooks/useContractTemplates";
import {
  DEFAULT_INTRO, DEFAULT_DECL_LANDLORD, DEFAULT_DECL_TENANT,
  DEFAULT_CLAUSES, DEFAULT_CHECKLIST, DEFAULT_PAGARE,
} from "@/lib/contractPdfData";

// --- Types ---
export interface ContractData {
  contract_number: string;
  customer_id?: string | null;
  forklift_id?: string | null;
  customer_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
  deposit_amount?: number | null;
  terms_text?: string | null;
  status: string;
  signed_at?: string | null;
  signed_by?: string | null;
  usage_location?: string | null;
  max_hours_per_month?: number | null;
  extra_hour_rate?: number | null;
  payment_frequency?: string | null;
  late_interest_rate?: number | null;
  contract_city?: string | null;
  witness_1?: string | null;
  witness_2?: string | null;
}

export type PDFMode = "full" | "contract" | "checklist" | "pagare";

export interface TemplateData {
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
}

// Re-export from shared utility for backward compatibility
export { replacePlaceholders } from "@/lib/templateUtils";

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
  return { company: companyRes.data, customer: customerRes.data as any, forklift: forkliftRes.data as any };
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

// --- PDF text helpers ---
function addWrappedText(doc: jsPDF, text: string, x: number, cursorY: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  let y = cursorY;
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = 20; }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function checkPage(doc: jsPDF, cursorY: number, needed: number = 15): number {
  if (cursorY + needed > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); return 20; }
  return cursorY;
}

// --- Page generators ---
export function generateContractPages(doc: jsPDF, contract: ContractData, company: any, customer: any, forklift: any, logoBase64: string | null, tpl: TemplateData, vars: Record<string, string>) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = 20;

  // Header with logo
  if (logoBase64) doc.addImage(logoBase64, "PNG", margin, cursorY - 5, 18, 18);
  const textX = logoBase64 ? margin + 22 : margin;
  doc.setFontSize(10); doc.setTextColor(51, 51, 51); doc.setFont("helvetica", "bold");
  doc.text(company?.razon_social || "Empresa", textX, cursorY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(102, 102, 102);
  if (company?.rfc) doc.text(`RFC: ${company.rfc} | C.P.: ${company.lugar_expedicion || ""}`, textX, cursorY + 5);
  doc.setFontSize(10); doc.setTextColor(102, 102, 102);
  doc.text(contract.contract_number, pageWidth - margin, cursorY, { align: "right" });
  cursorY += 20;

  // Title
  doc.setFontSize(14); doc.setTextColor(51, 51, 51); doc.setFont("helvetica", "bold");
  doc.text("CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 10;

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(51, 51, 51);

  // Intro
  cursorY = addWrappedText(doc, replacePlaceholders(tpl.intro_text || DEFAULT_INTRO, vars), margin, cursorY, pageWidth - margin * 2, 4.5);
  cursorY += 5;

  // I. DECLARACIONES
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  cursorY = checkPage(doc, cursorY);
  doc.text("I. DECLARACIONES", margin, cursorY); cursorY += 6;

  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Declara EL ARRENDADOR:", margin, cursorY); cursorY += 5;
  doc.setFont("helvetica", "normal");
  for (const declaration of tpl.declarations_landlord) {
    cursorY = checkPage(doc, cursorY);
    cursorY = addWrappedText(doc, `• ${replacePlaceholders(declaration, vars)}`, margin + 3, cursorY, pageWidth - margin * 2 - 6, 4.5);
  }
  cursorY += 3;

  doc.setFont("helvetica", "bold");
  cursorY = checkPage(doc, cursorY);
  doc.text("Declara EL ARRENDATARIO:", margin, cursorY); cursorY += 5;
  doc.setFont("helvetica", "normal");
  const tenantDeclarations = [...tpl.declarations_tenant];
  if (customer?.representante_legal && !tenantDeclarations.some((d: string) => d.includes("{representante_legal}"))) {
    tenantDeclarations.push(`Representada legalmente por: {representante_legal}.`);
  }
  for (const declaration of tenantDeclarations) {
    cursorY = checkPage(doc, cursorY);
    cursorY = addWrappedText(doc, `• ${replacePlaceholders(declaration, vars)}`, margin + 3, cursorY, pageWidth - margin * 2 - 6, 4.5);
  }
  cursorY += 5;

  // II. CLAUSULAS
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  cursorY = checkPage(doc, cursorY);
  doc.text("II. CLÁUSULAS", margin, cursorY); cursorY += 7;

  doc.setFontSize(9);
  for (const clause of tpl.clauses) {
    cursorY = checkPage(doc, cursorY, 20);
    doc.setFont("helvetica", "bold");
    doc.text(replacePlaceholders(clause.title, vars), margin, cursorY); cursorY += 5;
    doc.setFont("helvetica", "normal");
    cursorY = addWrappedText(doc, replacePlaceholders(clause.body, vars), margin, cursorY, pageWidth - margin * 2, 4.5);
    cursorY += 4;
  }

  // Signature block
  cursorY = checkPage(doc, cursorY, 45);
  cursorY += 5;
  const city = vars.ciudad;
  const now = new Date();
  doc.setFontSize(9);
  cursorY = addWrappedText(doc, `Leído el presente contrato, lo firman en ${city}, el día ${format(now, "dd/MM/yyyy")}.`, margin, cursorY, pageWidth - margin * 2, 4.5);
  cursorY += 12;

  doc.setDrawColor(51, 51, 51); doc.setLineWidth(0.5);
  const col1 = margin;
  const col2 = pageWidth / 2 + 5;
  const lineWidth = (pageWidth - margin * 2 - 10) / 2;

  doc.line(col1, cursorY, col1 + lineWidth, cursorY);
  doc.line(col2, cursorY, col2 + lineWidth, cursorY);
  cursorY += 4;
  doc.setFontSize(8);
  doc.text("EL ARRENDADOR", col1, cursorY);
  doc.text("EL ARRENDATARIO", col2, cursorY);
  cursorY += 4;
  doc.text(company?.razon_social || "", col1, cursorY);
  doc.text(customer?.name || contract.customer_name || "", col2, cursorY);
  if (customer?.representante_legal) { cursorY += 4; doc.text("", col1, cursorY); doc.text(`Rep. Legal: ${customer.representante_legal}`, col2, cursorY); }

  cursorY += 15;
  cursorY = checkPage(doc, cursorY, 25);
  doc.line(col1, cursorY, col1 + lineWidth, cursorY);
  doc.line(col2, cursorY, col2 + lineWidth, cursorY);
  cursorY += 4;
  doc.text("TESTIGO 1", col1, cursorY);
  doc.text("TESTIGO 2", col2, cursorY);
  cursorY += 4;
  doc.text(contract.witness_1 || "", col1, cursorY);
  doc.text(contract.witness_2 || "", col2, cursorY);
}

export function generateChecklistPage(doc: jsPDF, contract: ContractData, _company: any, _customer: any, forklift: any, tpl: TemplateData) {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = 20;

  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("ANEXO A: CHECKLIST DE INSPECCIÓN Y ENTREGA", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 8;

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(102, 102, 102);
  doc.text(`Parte integral del ${contract.contract_number}`, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 10;

  // General data
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("I. Datos Generales", margin, cursorY); cursorY += 6;

  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  const generalInfo = [
    ["Fecha y Hora de Entrega:", "______________________"],
    ["Lugar de Entrega:", contract.usage_location || "______________________"],
    ["Marca y Modelo:", `${forklift?.manufacturer || ""} ${forklift?.model || ""}`],
    ["Número de Serie:", forklift?.serial_number || "______________________"],
    ["Horómetro Inicial:", "____________  Final: ____________"],
    ["Tipo de Combustible:", forklift?.fuel_type || "______________________"],
    ["Nivel de Combustible Inicial:", "______________________"],
  ];
  for (const [label, val] of generalInfo) {
    doc.setFont("helvetica", "bold"); doc.text(label, margin, cursorY);
    doc.setFont("helvetica", "normal"); doc.text(val, margin + 50, cursorY);
    cursorY += 5;
  }
  cursorY += 3;

  // Checklist sections from template
  for (const section of tpl.checklist_sections) {
    cursorY = checkPage(doc, cursorY, 15);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(section.title, margin, cursorY); cursorY += 5;

    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    for (const item of section.items) {
      cursorY = checkPage(doc, cursorY);
      doc.rect(margin + 2, cursorY - 3, 3, 3);
      doc.text(item, margin + 8, cursorY);
      doc.setFontSize(7);
      doc.text("B", pageWidth - margin - 30, cursorY);
      doc.rect(pageWidth - margin - 27, cursorY - 3, 3, 3);
      doc.text("M", pageWidth - margin - 20, cursorY);
      doc.rect(pageWidth - margin - 17, cursorY - 3, 3, 3);
      doc.text("N/A", pageWidth - margin - 10, cursorY);
      doc.rect(pageWidth - margin - 4, cursorY - 3, 3, 3);
      doc.setFontSize(9);
      cursorY += 5;
    }
    cursorY += 2;
  }

  // Signatures
  cursorY = checkPage(doc, cursorY, 35);
  cursorY += 8;
  const col1 = margin;
  const col2 = pageWidth / 2 + 5;
  const lineWidth = (pageWidth - margin * 2 - 10) / 2;
  doc.setDrawColor(51, 51, 51);
  doc.line(col1, cursorY, col1 + lineWidth, cursorY);
  doc.line(col2, cursorY, col2 + lineWidth, cursorY);
  cursorY += 4;
  doc.setFontSize(8);
  doc.text("Entregado por (Técnico)", col1, cursorY);
  doc.text("Recibido por (Cliente)", col2, cursorY);
}

export function generatePagarePage(doc: jsPDF, contract: ContractData, company: any, customer: any, tpl: TemplateData, vars: Record<string, string>) {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = 25;

  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("PAGARÉ", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 8;

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(102, 102, 102);
  doc.text(`Anexo B del ${contract.contract_number}`, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 12;

  doc.setFontSize(9); doc.setTextColor(51, 51, 51);

  // Header info
  doc.setFont("helvetica", "bold"); doc.text("Número:", margin, cursorY);
  doc.setFont("helvetica", "normal"); doc.text("1/1", margin + 25, cursorY);
  doc.setFont("helvetica", "bold"); doc.text("Bueno por:", pageWidth / 2, cursorY);
  doc.setFont("helvetica", "normal"); doc.text(`$${vars.deposito}`, pageWidth / 2 + 25, cursorY);
  cursorY += 6;

  const city = vars.ciudad;
  doc.setFont("helvetica", "bold"); doc.text("Lugar:", margin, cursorY);
  doc.setFont("helvetica", "normal"); doc.text(city, margin + 25, cursorY);
  cursorY += 6;
  doc.setFont("helvetica", "bold"); doc.text("Fecha:", margin, cursorY);
  doc.setFont("helvetica", "normal");
  const now = new Date();
  doc.text(format(now, "dd/MM/yyyy"), margin + 25, cursorY);
  cursorY += 12;

  // Body text from template
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("TEXTO DEL PAGARÉ", margin, cursorY); cursorY += 7;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const pagareText = replacePlaceholders(tpl.pagare_text || DEFAULT_PAGARE, vars);
  cursorY = addWrappedText(doc, pagareText, margin, cursorY, pageWidth - margin * 2, 4.5);
  cursorY += 15;

  // Suscriptor
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  cursorY = checkPage(doc, cursorY, 40);
  doc.text("1. DATOS DEL SUSCRIPTOR", margin, cursorY); cursorY += 7;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Nombre / Razón Social: ${customer?.name || "______________________"}`, margin, cursorY); cursorY += 5;
  doc.text(`Representante Legal: ${customer?.representante_legal || customer?.contact_person || "______________________"}`, margin, cursorY); cursorY += 5;
  doc.text(`Domicilio: ${customer?.address || "______________________"}`, margin, cursorY); cursorY += 5;
  doc.text(`RFC: ${customer?.rfc || "______________________"}`, margin, cursorY); cursorY += 12;

  doc.setDrawColor(51, 51, 51);
  doc.line(margin, cursorY, margin + 60, cursorY); cursorY += 4;
  doc.setFontSize(8);
  doc.text("Firma del Suscriptor", margin, cursorY);

  cursorY += 18;
  cursorY = checkPage(doc, cursorY, 30);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("2. DATOS DEL AVAL (Opcional)", margin, cursorY); cursorY += 7;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text("Nombre: ______________________", margin, cursorY); cursorY += 5;
  doc.text("Domicilio: ______________________", margin, cursorY); cursorY += 12;

  doc.line(margin, cursorY, margin + 60, cursorY); cursorY += 4;
  doc.setFontSize(8);
  doc.text("Firma del Aval", margin, cursorY);
}
