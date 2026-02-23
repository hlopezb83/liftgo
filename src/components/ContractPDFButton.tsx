import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

interface Contract {
  contract_number: string;
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
}

export function ContractPDFButton({ contract }: { contract: Contract }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();

      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const mg = 20;
      let y = 20;

      // Header
      doc.setFontSize(20);
      doc.setTextColor(232, 89, 12);
      doc.text(company?.razon_social || "ForkliftERP", mg, y);
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      if (company) doc.text(`RFC: ${company.rfc} | C.P.: ${company.lugar_expedicion}`, mg, y + 7);

      doc.setFontSize(22);
      doc.setTextColor(51, 51, 51);
      doc.text("CONTRATO DE RENTA", pw - mg, y, { align: "right" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(contract.contract_number, pw - mg, y + 8, { align: "right" });

      y += 25;

      // Info
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Cliente:", mg, y);
      doc.setFont("helvetica", "normal");
      doc.text(contract.customer_name || "—", mg + 25, y);

      y += 7;
      doc.setFont("helvetica", "bold");
      doc.text("Equipo:", mg, y);
      doc.setFont("helvetica", "normal");
      doc.text(contract.forklift_name || "—", mg + 25, y);

      y += 7;
      doc.text(`Periodo: ${contract.start_date || "—"} a ${contract.end_date || "—"}`, mg, y);

      y += 12;
      // Rates table
      doc.setFillColor(248, 249, 250);
      doc.rect(mg, y - 5, pw - mg * 2, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Tarifa Diaria", mg + 5, y);
      doc.text("Tarifa Semanal", mg + 50, y);
      doc.text("Tarifa Mensual", mg + 100, y);
      doc.text("Depósito", pw - mg - 5, y, { align: "right" });

      y += 8;
      doc.setFont("helvetica", "normal");
      doc.text(`$${Number(contract.daily_rate || 0).toFixed(2)}`, mg + 5, y);
      doc.text(`$${Number(contract.weekly_rate || 0).toFixed(2)}`, mg + 50, y);
      doc.text(`$${Number(contract.monthly_rate || 0).toFixed(2)}`, mg + 100, y);
      doc.text(`$${Number(contract.deposit_amount || 0).toFixed(2)}`, pw - mg - 5, y, { align: "right" });

      y += 15;

      // Terms
      if (contract.terms_text) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Términos y Condiciones", mg, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(contract.terms_text, pw - mg * 2);
        doc.text(lines, mg, y);
        y += lines.length * 4 + 10;
      }

      // Signature lines
      y = Math.max(y, 220);
      doc.setDrawColor(51, 51, 51);
      doc.setLineWidth(0.5);
      doc.line(mg, y, mg + 60, y);
      doc.line(pw - mg - 60, y, pw - mg, y);
      y += 5;
      doc.setFontSize(9);
      doc.text("Firma del Arrendador", mg, y);
      doc.text("Firma del Arrendatario", pw - mg - 60, y);

      if (contract.signed_by) {
        y += 10;
        doc.setFontSize(8);
        doc.setTextColor(102, 102, 102);
        doc.text(`Firmado por: ${contract.signed_by}`, mg, y);
        if (contract.signed_at) doc.text(`Fecha: ${new Date(contract.signed_at).toLocaleDateString()}`, mg, y + 5);
      }

      doc.save(`${contract.contract_number}.pdf`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al generar PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
      <FileDown className="h-4 w-4 mr-1" />
      {loading ? "Generando..." : "Descargar PDF"}
    </Button>
  );
}
