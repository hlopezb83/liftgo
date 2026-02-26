import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileDown, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { loadImageAsBase64 } from "@/lib/loadImageAsBase64";

interface ContractData {
  contract_number: string;
  customer_id?: string | null;
  forklift_id?: string | null;
  customer_name?: string | null;
  forklift_name?: string | null;
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

type PDFMode = "full" | "contract" | "checklist" | "pagare";

async function fetchRelatedData(contract: ContractData) {
  const [companyRes, customerRes, forkliftRes] = await Promise.all([
    supabase.from("company_settings").select("*").limit(1).maybeSingle(),
    contract.customer_id
      ? supabase.from("customers").select("*").eq("id", contract.customer_id).single()
      : Promise.resolve({ data: null }),
    contract.forklift_id
      ? supabase.from("forklifts").select("*").eq("id", contract.forklift_id).single()
      : Promise.resolve({ data: null }),
  ]);
  return {
    company: companyRes.data,
    customer: customerRes.data as any,
    forklift: forkliftRes.data as any,
  };
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function checkPage(doc: jsPDF, y: number, needed: number = 15): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    return 20;
  }
  return y;
}

function generateContractPages(doc: jsPDF, contract: ContractData, company: any, customer: any, forklift: any, logoBase64: string | null) {
  const pw = doc.internal.pageSize.getWidth();
  const mg = 20;
  let y = 20;

  // Header with logo
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", mg, y - 5, 18, 18);
  }
  const textX = logoBase64 ? mg + 22 : mg;
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.setFont("helvetica", "bold");
  doc.text(company?.razon_social || "Empresa", textX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  if (company?.rfc) doc.text(`RFC: ${company.rfc} | C.P.: ${company.lugar_expedicion || ""}`, textX, y + 5);

  doc.setFontSize(10);
  doc.setTextColor(102, 102, 102);
  doc.text(contract.contract_number, pw - mg, y, { align: "right" });

  y += 20;

  // Title
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.setFont("helvetica", "bold");
  doc.text("CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO", pw / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 51, 51);

  // Intro paragraph
  const intro = `Contrato de arrendamiento que celebran por una parte ${company?.razon_social || "[Arrendador]"}, en lo sucesivo "EL ARRENDADOR", y por la otra parte ${customer?.name || contract.customer_name || "[Arrendatario]"}, en lo sucesivo "EL ARRENDATARIO", de conformidad con las siguientes declaraciones y cláusulas:`;
  y = addWrappedText(doc, intro, mg, y, pw - mg * 2, 4.5);
  y += 5;

  // I. DECLARACIONES
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y = checkPage(doc, y);
  doc.text("I. DECLARACIONES", mg, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Declara EL ARRENDADOR:", mg, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const declAr = [
    "Ser una Persona Moral legalmente constituida bajo las leyes de los Estados Unidos Mexicanos.",
    "Tener la capacidad jurídica y económica para celebrar este contrato.",
    "Ser el legítimo propietario del equipo descrito en este contrato.",
  ];
  for (const d of declAr) {
    y = checkPage(doc, y);
    doc.text(`• ${d}`, mg + 3, y);
    y += 4.5;
  }
  y += 3;

  doc.setFont("helvetica", "bold");
  y = checkPage(doc, y);
  doc.text("Declara EL ARRENDATARIO:", mg, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const declAt = [
    "Ser una Persona Moral legalmente constituida, con facultades suficientes para obligarse en los términos de este contrato.",
    `Tener su domicilio legal en: ${customer?.address || "[Domicilio del cliente]"}.`,
    ...(customer?.representante_legal ? [`Representada legalmente por: ${customer.representante_legal}.`] : []),
    "Requerir el equipo única y exclusivamente para maniobras y carga de materiales lícitos dentro de sus instalaciones.",
  ];
  for (const d of declAt) {
    y = checkPage(doc, y);
    y = addWrappedText(doc, `• ${d}`, mg + 3, y, pw - mg * 2 - 6, 4.5);
  }
  y += 5;

  // II. CLAUSULAS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y = checkPage(doc, y);
  doc.text("II. CLÁUSULAS", mg, y);
  y += 7;

  const clauses: { title: string; body: string }[] = [
    {
      title: "PRIMERA. Objeto del Contrato:",
      body: `EL ARRENDADOR otorga en arrendamiento a EL ARRENDATARIO el siguiente equipo:\n• Marca: ${forklift?.manufacturer || "—"}\n• Modelo: ${forklift?.model || "—"}\n• Número de Serie: ${forklift?.serial_number || "—"}\n• Capacidad de Carga: ${forklift?.capacity_kg ? forklift.capacity_kg + " kg" : "—"}\n• Tipo de Combustible: ${forklift?.fuel_type || "—"}`,
    },
    {
      title: "SEGUNDA. Lugar y Condiciones de Uso:",
      body: `• El Equipo será utilizado exclusivamente en: ${contract.usage_location || "[Dirección]"}.\n• Uso máximo: ${contract.max_hours_per_month || "—"} horas/mes. Cargo por hora extra: $${Number(contract.extra_hour_rate || 0).toFixed(2)}.\n• El Equipo no podrá ser trasladado sin consentimiento escrito de EL ARRENDADOR.\n• EL ARRENDATARIO se obliga a que el equipo sea operado por personal capacitado y certificado.`,
    },
    {
      title: "TERCERA. Vigencia:",
      body: `El plazo del arrendamiento iniciará el ${contract.start_date || "[Fecha]"} y terminará el ${contract.end_date || "[Fecha]"}. Al término, EL ARRENDATARIO deberá devolver El Equipo en las mismas condiciones en que lo recibió, salvo desgaste normal.`,
    },
    {
      title: "CUARTA. Precio y Forma de Pago:",
      body: `• Tarifa diaria: $${Number(contract.daily_rate || 0).toFixed(2)} | Semanal: $${Number(contract.weekly_rate || 0).toFixed(2)} | Mensual: $${Number(contract.monthly_rate || 0).toFixed(2)} más IVA.\n• Pago: ${contract.payment_frequency || "Mensual"}.\n• Interés moratorio: ${contract.late_interest_rate || 5}% mensual sobre saldos insolutos.`,
    },
    {
      title: "QUINTA. Mantenimiento y Reparaciones:",
      body: "• Mantenimiento Preventivo: A cargo de EL ARRENDADOR.\n• Revisión Diaria (Checklist): A cargo de EL ARRENDATARIO.\n• Mantenimiento Correctivo: Si la falla es por desgaste normal, a cargo de EL ARRENDADOR. Si es por negligencia o mal uso, a cargo de EL ARRENDATARIO al 100%.",
    },
    {
      title: "SEXTA. Responsabilidad Civil y Riesgos:",
      body: "• A partir de la entrega material, EL ARRENDATARIO asume el riesgo de pérdida, robo, destrucción o daños.\n• EL ARRENDATARIO exime a EL ARRENDADOR de cualquier responsabilidad civil, penal o laboral derivada de accidentes.",
    },
    {
      title: "SÉPTIMA. Rescisión:",
      body: "Son causas de rescisión inmediata sin responsabilidad para EL ARRENDADOR:\n• Falta de pago de una o más rentas.\n• Uso indebido o negligente del equipo.\n• Subarrendamiento no autorizado.\n• Incumplimiento de cualquier cláusula.",
    },
    {
      title: "OCTAVA. Jurisdicción y Competencia:",
      body: "Las partes se someten a las leyes aplicables y a los tribunales competentes de Monterrey, Nuevo León, renunciando a cualquier otro fuero.",
    },
  ];

  doc.setFontSize(9);
  for (const clause of clauses) {
    y = checkPage(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.text(clause.title, mg, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    y = addWrappedText(doc, clause.body, mg, y, pw - mg * 2, 4.5);
    y += 4;
  }

  // Signature block
  y = checkPage(doc, y, 45);
  y += 5;
  const city = contract.contract_city || "San Pedro Garza García, N.L.";
  const now = new Date();
  doc.setFontSize(9);
  y = addWrappedText(doc, `Leído el presente contrato, lo firman en ${city}, el día ${now.getDate()} de ${now.toLocaleDateString("es-MX", { month: "long" })} de ${now.getFullYear()}.`, mg, y, pw - mg * 2, 4.5);
  y += 12;

  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  const col1 = mg;
  const col2 = pw / 2 + 5;
  const lineW = (pw - mg * 2 - 10) / 2;

  doc.line(col1, y, col1 + lineW, y);
  doc.line(col2, y, col2 + lineW, y);
  y += 4;
  doc.setFontSize(8);
  doc.text("EL ARRENDADOR", col1, y);
  doc.text("EL ARRENDATARIO", col2, y);
  y += 4;
  doc.text(company?.razon_social || "", col1, y);
  doc.text(customer?.name || contract.customer_name || "", col2, y);
  if (customer?.representante_legal) {
    y += 4;
    doc.text("", col1, y);
    doc.text(`Rep. Legal: ${customer.representante_legal}`, col2, y);
  }

  y += 15;
  y = checkPage(doc, y, 25);
  doc.line(col1, y, col1 + lineW, y);
  doc.line(col2, y, col2 + lineW, y);
  y += 4;
  doc.text("TESTIGO 1", col1, y);
  doc.text("TESTIGO 2", col2, y);
  y += 4;
  doc.text(contract.witness_1 || "", col1, y);
  doc.text(contract.witness_2 || "", col2, y);
}

function generateChecklistPage(doc: jsPDF, contract: ContractData, company: any, customer: any, forklift: any) {
  doc.addPage();
  const pw = doc.internal.pageSize.getWidth();
  const mg = 20;
  let y = 20;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("ANEXO A: CHECKLIST DE INSPECCIÓN Y ENTREGA", pw / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(102, 102, 102);
  doc.text(`Parte integral del ${contract.contract_number}`, pw / 2, y, { align: "center" });
  y += 10;

  // General data
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("I. Datos Generales", mg, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const info = [
    ["Fecha y Hora de Entrega:", "______________________"],
    ["Lugar de Entrega:", contract.usage_location || "______________________"],
    ["Marca y Modelo:", `${forklift?.manufacturer || ""} ${forklift?.model || ""}`],
    ["Número de Serie:", forklift?.serial_number || "______________________"],
    ["Horómetro Inicial:", "____________  Final: ____________"],
    ["Tipo de Combustible:", forklift?.fuel_type || "______________________"],
    ["Nivel de Combustible Inicial:", "______________________"],
  ];
  for (const [label, val] of info) {
    doc.setFont("helvetica", "bold");
    doc.text(label, mg, y);
    doc.setFont("helvetica", "normal");
    doc.text(val, mg + 50, y);
    y += 5;
  }
  y += 3;

  // Checklist sections
  const sections: { title: string; items: string[] }[] = [
    { title: "II. Niveles y Fluidos", items: ["Aceite del motor", "Aceite hidráulico", "Líquido refrigerante", "Líquido de frenos", "Fugas visibles"] },
    { title: "III. Sistema Mecánico e Hidráulico", items: ["Estado de horquillas", "Funcionamiento del mástil", "Inclinación del mástil", "Desplazador lateral", "Cadenas y poleas"] },
    { title: "IV. Seguridad y Operación", items: ["Cinturón de seguridad", "Claxon", "Alarma de reversa", "Luces delanteras", "Luces traseras", "Torreta estroboscópica", "Espejos retrovisores", "Extintor", "Freno de mano"] },
    { title: "V. Llantas y Tracción", items: ["Llantas delanteras", "Llantas traseras", "Birlos y tuercas"] },
    { title: "VI. Estética", items: ["Asiento del operador", "Tapas y cubiertas", "Pintura y golpes"] },
  ];

  for (const section of sections) {
    y = checkPage(doc, y, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(section.title, mg, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    for (const item of section.items) {
      y = checkPage(doc, y);
      doc.rect(mg + 2, y - 3, 3, 3);
      doc.text(item, mg + 8, y);
      // Status columns
      doc.setFontSize(7);
      doc.text("B", pw - mg - 30, y);
      doc.rect(pw - mg - 27, y - 3, 3, 3);
      doc.text("M", pw - mg - 20, y);
      doc.rect(pw - mg - 17, y - 3, 3, 3);
      doc.text("N/A", pw - mg - 10, y);
      doc.rect(pw - mg - 4, y - 3, 3, 3);
      doc.setFontSize(9);
      y += 5;
    }
    y += 2;
  }

  // Signatures
  y = checkPage(doc, y, 35);
  y += 8;
  const col1 = mg;
  const col2 = pw / 2 + 5;
  const lineW = (pw - mg * 2 - 10) / 2;
  doc.setDrawColor(51, 51, 51);
  doc.line(col1, y, col1 + lineW, y);
  doc.line(col2, y, col2 + lineW, y);
  y += 4;
  doc.setFontSize(8);
  doc.text("Entregado por (Técnico)", col1, y);
  doc.text("Recibido por (Cliente)", col2, y);
}

function generatePagarePage(doc: jsPDF, contract: ContractData, company: any, customer: any) {
  doc.addPage();
  const pw = doc.internal.pageSize.getWidth();
  const mg = 20;
  let y = 25;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("PAGARÉ", pw / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(102, 102, 102);
  doc.text(`Anexo B del ${contract.contract_number}`, pw / 2, y, { align: "center" });
  y += 12;

  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);

  // Header info
  doc.setFont("helvetica", "bold");
  doc.text("Número:", mg, y);
  doc.setFont("helvetica", "normal");
  doc.text("1/1", mg + 25, y);
  doc.setFont("helvetica", "bold");
  doc.text("Bueno por:", pw / 2, y);
  doc.setFont("helvetica", "normal");
  doc.text(`$${Number(contract.deposit_amount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, pw / 2 + 25, y);
  y += 6;

  const city = contract.contract_city || "San Pedro Garza García, N.L.";
  doc.setFont("helvetica", "bold");
  doc.text("Lugar:", mg, y);
  doc.setFont("helvetica", "normal");
  doc.text(city, mg + 25, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Fecha:", mg, y);
  doc.setFont("helvetica", "normal");
  const now = new Date();
  doc.text(`${now.getDate()} de ${now.toLocaleDateString("es-MX", { month: "long" })} de ${now.getFullYear()}`, mg + 25, y);
  y += 12;

  // Body text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TEXTO DEL PAGARÉ", mg, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const depositStr = Number(contract.deposit_amount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });
  const pagareText = `Por este PAGARÉ me(nos) obligo(amos) a pagar incondicionalmente a la orden de ${company?.razon_social || "[Arrendador]"}, en la ciudad de ${city}, la cantidad de $${depositStr} (Pesos Mexicanos).

Si este pagaré no es cubierto a su vencimiento, causará intereses moratorios a razón del ${contract.late_interest_rate || 5}% mensual desde la fecha de su vencimiento y hasta su total liquidación.

Todos los suscriptores y avalistas renuncian al fuero de su domicilio y se someten a la jurisdicción de los tribunales competentes en Monterrey, Nuevo León.`;

  y = addWrappedText(doc, pagareText, mg, y, pw - mg * 2, 4.5);
  y += 15;

  // Suscriptor
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  y = checkPage(doc, y, 40);
  doc.text("1. DATOS DEL SUSCRIPTOR", mg, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Nombre / Razón Social: ${customer?.name || "______________________"}`, mg, y); y += 5;
  doc.text(`Representante Legal: ${customer?.representante_legal || customer?.contact_person || "______________________"}`, mg, y); y += 5;
  doc.text(`Domicilio: ${customer?.address || "______________________"}`, mg, y); y += 5;
  doc.text(`RFC: ${customer?.rfc || "______________________"}`, mg, y); y += 12;

  doc.setDrawColor(51, 51, 51);
  doc.line(mg, y, mg + 60, y);
  y += 4;
  doc.setFontSize(8);
  doc.text("Firma del Suscriptor", mg, y);

  y += 18;
  y = checkPage(doc, y, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("2. DATOS DEL AVAL (Opcional)", mg, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Nombre: ______________________", mg, y); y += 5;
  doc.text("Domicilio: ______________________", mg, y); y += 12;

  doc.line(mg, y, mg + 60, y);
  y += 4;
  doc.setFontSize(8);
  doc.text("Firma del Aval", mg, y);
}

export function ContractPDFButton({ contract }: { contract: ContractData }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (mode: PDFMode) => {
    setLoading(true);
    try {
      const { company, customer, forklift } = await fetchRelatedData(contract);

      let logoBase64: string | null = null;
      if (company?.logo_url) {
        logoBase64 = await loadImageAsBase64(company.logo_url);
      }

      const doc = new jsPDF();

      if (mode === "full" || mode === "contract") {
        generateContractPages(doc, contract, company, customer, forklift, logoBase64);
      }
      if (mode === "full" || mode === "checklist") {
        if (mode === "checklist") {
          // remove blank first page
          generateChecklistPage(doc, contract, company, customer, forklift);
          doc.deletePage(1);
        } else {
          generateChecklistPage(doc, contract, company, customer, forklift);
        }
      }
      if (mode === "full" || mode === "pagare") {
        if (mode === "pagare") {
          generatePagarePage(doc, contract, company, customer);
          doc.deletePage(1);
        } else {
          generatePagarePage(doc, contract, company, customer);
        }
      }

      const suffix = mode === "full" ? "" : `-${mode}`;
      doc.save(`${contract.contract_number}${suffix}.pdf`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al generar PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          <FileDown className="h-4 w-4 mr-1" />
          {loading ? "Generando..." : "Descargar PDF"}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleDownload("full")}>
          Contrato Completo (con Anexos)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("contract")}>
          Solo Contrato
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("checklist")}>
          Solo Checklist (Anexo A)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("pagare")}>
          Solo Pagaré (Anexo B)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
