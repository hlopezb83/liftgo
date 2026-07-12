import { ContractDocument, type PDFMode } from "@/lib/pdf/documents/ContractDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import type { ContractData } from "@/lib/pdf/contract/data";

export async function buildContractPdf(contract: ContractData, mode: PDFMode): Promise<void> {
  const { fetchRelatedData, fetchTemplate, fetchLogoBase64, buildPlaceholderVars } =
    await import("@/lib/pdf/contract/data");

  const { company, customer, forklift } = await fetchRelatedData(contract);
  const tpl = await fetchTemplate();
  const vars = buildPlaceholderVars(contract, company, customer, forklift);
  const logoBase64 = await fetchLogoBase64(company?.logo_url);

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
