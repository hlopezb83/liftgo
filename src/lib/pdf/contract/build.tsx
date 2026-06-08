import type { ContractData } from "@/lib/pdf/contract/data";
import type { PDFMode } from "@/lib/pdf/documents/ContractDocument";

export async function buildContractPdf(contract: ContractData, mode: PDFMode): Promise<void> {
  const [
    { fetchRelatedData, fetchTemplate, fetchLogoBase64, buildPlaceholderVars },
    { pdf },
    { saveAs },
    { ContractDocument },
  ] = await Promise.all([
    import("@/lib/pdf/contract/data"),
    import("@react-pdf/renderer"),
    import("file-saver"),
    import("@/lib/pdf/documents/ContractDocument"),
  ]);

  const { company, customer, forklift } = await fetchRelatedData(contract);
  const tpl = await fetchTemplate();
  const vars = buildPlaceholderVars(contract, company, customer, forklift);
  const logoBase64 = await fetchLogoBase64(company?.logo_url);

  const blob = await pdf(
    <ContractDocument
      mode={mode}
      contract={contract}
      tpl={tpl}
      vars={vars}
      logoBase64={logoBase64}
      company={company}
      customer={customer}
      forklift={forklift}
    />
  ).toBlob();
  const suffix = mode === "full" ? "" : `-${mode}`;
  saveAs(blob, `${contract.contract_number}${suffix}.pdf`);
}
