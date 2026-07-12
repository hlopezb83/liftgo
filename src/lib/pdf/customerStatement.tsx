import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import type { CustomerSummary } from "@/lib/domain/customerTypes";
import { fetchCompanyDataAndLogo } from "@/lib/pdf/shared";
import { nowMty } from "@/lib/utils";

interface ExportStatementParams {
  customer: Tables<"customers">;
  summary: CustomerSummary;
}

export async function exportCustomerStatementPdf({ customer, summary }: ExportStatementParams): Promise<void> {
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();
  const folio = `EC-${format(nowMty(), "yyyyMMdd")}`;

  const [{ pdf }, { saveAs }, { CustomerStatementDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("file-saver"),
    import("@/lib/pdf/documents/CustomerStatementDocument"),
  ]);

  const blob = await pdf(
    <CustomerStatementDocument
      company={company}
      logoBase64={logoBase64}
      folio={folio}
      customerName={customer.name}
      customerRfc={customer.rfc ?? null}
      customerCp={customer.domicilio_fiscal_cp ?? null}
      summary={summary}
    />
  ).toBlob();
  saveAs(blob, `estado-cuenta-${customer.name.replace(/\s+/g, "-")}-${format(nowMty(), "yyyyMMdd")}.pdf`);
}
