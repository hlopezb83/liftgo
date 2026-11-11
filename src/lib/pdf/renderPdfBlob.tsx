import { Font, pdf } from "@react-pdf/renderer";
import { ContractDocument, type ContractDocumentProps } from "./documents/ContractDocument";
import { CustomerStatementDocument, type CustomerStatementDocumentProps } from "./documents/CustomerStatementDocument";
import { IncomeStatementDocument, type IncomeStatementDocumentProps } from "./documents/IncomeStatementDocument";
import { InvoiceDocument, type InvoiceDocumentProps } from "./documents/InvoiceDocument";
import { QuoteDocument, type QuoteDocumentProps } from "./documents/QuoteDocument";

export type PdfExport =
  | { kind: "contract"; props: ContractDocumentProps }
  | { kind: "customerStatement"; props: CustomerStatementDocumentProps }
  | { kind: "incomeStatement"; props: IncomeStatementDocumentProps }
  | { kind: "invoice"; props: InvoiceDocumentProps }
  | { kind: "quote"; props: QuoteDocumentProps };

let configured = false;

export function renderPdfBlob(input: PdfExport): Promise<Blob> {
  if (!configured) {
    // The default hyphenation rules are intended for English text.
    Font.registerHyphenationCallback((word) => [word]);
    configured = true;
  }
  switch (input.kind) {
    case "contract": return pdf(<ContractDocument {...input.props} />).toBlob();
    case "customerStatement": return pdf(<CustomerStatementDocument {...input.props} />).toBlob();
    case "incomeStatement": return pdf(<IncomeStatementDocument {...input.props} />).toBlob();
    case "invoice": return pdf(<InvoiceDocument {...input.props} />).toBlob();
    case "quote": return pdf(<QuoteDocument {...input.props} />).toBlob();
  }
}
