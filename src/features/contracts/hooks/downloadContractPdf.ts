import type { ContractData } from "@/lib/pdf/contract/data";
import { buildPlaceholderVars, resolvePagareAmount } from "@/lib/pdf/contract/placeholders";
import type { PDFMode } from "@/lib/pdf/documents/ContractDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import { notifyWarning } from "@/lib/ui/appFeedback";
import { contractForPdf, fetchRelatedData, fetchTemplate } from "./contractPdfData";

export async function buildContractPdf(contract: ContractData, mode: PDFMode): Promise<void> {
  const printableContract = contractForPdf(contract);
  const [related, tpl] = await Promise.all([fetchRelatedData(contract), fetchTemplate(contract)]);
  const { company, customer, forklift, logoBase64 } = related;
  const vars = buildPlaceholderVars(printableContract, company, customer, forklift, tpl.local_overrides);

  if (!customer?.representante_legal) {
    notifyWarning("El cliente no tiene Representante Legal capturado", {
      description: "El contrato y el pagaré saldrán con la línea en blanco para llenarse a mano.",
    });
  }

  // G-A2: sin costo de adquisición ni depósito el Anexo B sale "Bueno por $0.00".
  if ((mode === "full" || mode === "pagare") && resolvePagareAmount(printableContract, forklift) <= 0) {
    notifyWarning("El pagaré saldrá por $0.00", {
      description:
        "El equipo no tiene costo de adquisición y el contrato no tiene depósito en garantía. Captura alguno de los dos antes de recabar la firma.",
    });
  }



  const suffix = mode === "full" ? "" : `-${mode}`;
  await renderAndSave(
    { kind: "contract", props: { mode, contract: printableContract, tpl, vars, logoBase64, company, customer, forklift } },
    `${printableContract.contract_number}${suffix}.pdf`,
  );
}

