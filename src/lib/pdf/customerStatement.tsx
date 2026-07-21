import { format } from "date-fns";
import type { CustomerSummary } from "@/lib/domain/customerTypes";
import { CustomerStatementDocument } from "@/lib/pdf/documents/CustomerStatementDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import { fetchCompanyDataAndLogo } from "@/lib/pdf/shared";
import { nowMty } from "@/lib/utils";

interface ExportStatementCustomer {
  id: string;
  name: string;
  rfc: string | null;
  domicilio_fiscal_cp: string | null;
}

interface ExportStatementParams {
  customer: ExportStatementCustomer;
  summary: CustomerSummary;
}

export async function exportCustomerStatementPdf({ customer, summary }: ExportStatementParams): Promise<void> {
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();
  const folio = `EC-${format(nowMty(), "yyyyMMdd")}`;

  await renderAndSave(
    <CustomerStatementDocument
      company={company}
      logoBase64={logoBase64}
      folio={folio}
      customerName={customer.name}
      customerRfc={customer.rfc ?? null}
      customerCp={customer.domicilio_fiscal_cp ?? null}
      summary={summary}
    />,
    `estado-cuenta-${customer.name.replace(/\s+/g, "-")}-${format(nowMty(), "yyyyMMdd")}.pdf`,
  );
}
