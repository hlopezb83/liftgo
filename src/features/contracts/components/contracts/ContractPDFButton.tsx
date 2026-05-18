import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { ContractData, PDFMode } from "@/lib/pdf/contractGenerator";

export type { ContractData } from "@/lib/pdf/contractGenerator";

export function ContractPDFButton({ contract }: { contract: ContractData }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (mode: PDFMode) => {
    setLoading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const {
        fetchRelatedData, fetchTemplate, fetchLogoBase64,
        buildPlaceholderVars,
        generateContractPages, generateChecklistPage, generatePagarePage,
      } = await import("@/lib/pdf/contractGenerator");

      const [{ company, customer, forklift }, tpl] = await Promise.all([
        fetchRelatedData(contract),
        fetchTemplate(),
      ]);

      const vars = buildPlaceholderVars(contract, company, customer, forklift);
      const logoBase64 = await fetchLogoBase64(company?.logo_url);
      const doc = new jsPDF();

      const wantsContract = mode === "full" || mode === "contract";
      const wantsChecklist = mode === "full" || mode === "checklist";
      const wantsPagare = mode === "full" || mode === "pagare";

      if (wantsContract) {
        generateContractPages(doc, contract, company, customer, forklift, logoBase64, tpl, vars);
      }
      if (wantsChecklist) {
        generateChecklistPage(doc, contract, company, customer, forklift, tpl);
        if (mode === "checklist") doc.deletePage(1);
      }
      if (wantsPagare) {
        generatePagarePage(doc, contract, company, customer, tpl, vars);
        if (mode === "pagare") doc.deletePage(1);
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
        <DropdownMenuItem onClick={() => handleDownload("full")}>Contrato Completo (con Anexos)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("contract")}>Solo Contrato</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("checklist")}>Solo Checklist (Anexo A)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("pagare")}>Solo Pagaré (Anexo B)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
