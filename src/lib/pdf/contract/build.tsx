import type { ContractData } from "@/lib/pdf/contract/data";
import { ContractDocument, type PDFMode } from "@/lib/pdf/documents/ContractDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import { notifyWarning } from "@/lib/ui/appFeedback";

export async function buildContractPdf(contract: ContractData, mode: PDFMode): Promise<void> {
  const { fetchRelatedData, fetchTemplate, fetchLogoBase64, buildPlaceholderVars } =
    await import("@/lib/pdf/contract/data");

  const { company, customer, forklift } = await fetchRelatedData(contract);
  const tpl = await fetchTemplate();
  const vars = buildPlaceholderVars(contract, company, customer, forklift);
  const logoBase64 = await fetchLogoBase64(company?.logo_url);

  if (!customer?.representante_legal) {
    notifyWarning("El cliente no tiene Representante Legal capturado", {
      description: "El contrato y el pagaré saldrán con la línea en blanco para llenarse a mano.",
    });
  }


  const suffix = mode === "full" ? "" : `-${mode}`;
  await renderAndSave(
    <ContractDocument
      mode={mode}
      contract={contract}
      tpl={tpl}
      vars={vars}
      logoBase64={logoBase64}
      company={company}
      customer={customer}
      forklift={forklift}
    />,
    `${contract.contract_number}${suffix}.pdf`,
  );
}
