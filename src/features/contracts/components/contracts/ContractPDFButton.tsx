import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileDown, ChevronDown } from "lucide-react";
import type { ContractData } from "@/lib/pdf/contract/data";
import type { PDFMode } from "@/lib/pdf/documents/ContractDocument";
import { buildContractPdf } from "@/features/contracts/lib/contractPdfBuilder";

export type { ContractData } from "@/lib/pdf/contract/data";

export function ContractPDFButton({ contract }: { contract: ContractData }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (mode: PDFMode) => {
    setLoading(true);
    try {
      await buildContractPdf(contract, mode);
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al generar PDF" });
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
