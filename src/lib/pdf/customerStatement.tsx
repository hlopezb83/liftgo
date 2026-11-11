import { format } from "date-fns";
import type { CustomerSummary } from "@/lib/domain/customerTypes";
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
  // Tramo 3: el portal sólo obtiene el emisor de su propio cliente autorizado.
  const { company, logoBase64 } = await fetchCompanyDataAndLogo({
    type: "customer",
    id: customer.id,
  });
  const folio = `EC-${format(nowMty(), "yyyyMMdd")}`;

  await renderAndSave(
    { kind: "customerStatement", props: {
      company, logoBase64, folio, customerName: customer.name,
      customerRfc: customer.rfc ?? null, customerCp: customer.domicilio_fiscal_cp ?? null, summary,
    } },
    `estado-cuenta-${customer.name.replace(/\s+/g, "-")}-${format(nowMty(), "yyyyMMdd")}.pdf`,
  );
}
