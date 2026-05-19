import { Document, Page } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Header } from "@/lib/pdf/components/Header";
import { InfoCards } from "@/lib/pdf/components/InfoCards";
import { LineItemsTable } from "@/lib/pdf/components/LineItemsTable";
import { TotalsBox } from "@/lib/pdf/components/TotalsBox";
import { Footer } from "@/lib/pdf/components/Footer";
import type { CompanyData, PdfLineItem } from "@/lib/pdf/shared";

export interface QuoteDocumentProps {
  company: CompanyData | null;
  logoBase64: string | null;
  quoteNumber: string;
  customerName: string | null;
  customerRfc: string | null;
  customerCp: string | null;
  startDate: string | null;
  endDate: string | null;
  validUntil: string | null;
  isSale: boolean;
  lineItems: PdfLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes: string | null;
}

export function QuoteDocument(props: QuoteDocumentProps) {
  const kicker = props.isSale ? "COTIZACIÓN DE VENTA" : "COTIZACIÓN";
  return (
    <Document title={props.quoteNumber} author={props.company?.razon_social ?? "LiftGo"}>
      <Page size="A4" style={sharedStyles.page}>
        <AccentBar />
        <Header
          logoBase64={props.logoBase64}
          kicker={kicker}
          documentNumber={props.quoteNumber}
        />
        <InfoCards
          company={props.company}
          customerName={props.customerName}
          customerRfc={props.customerRfc}
          customerCp={props.customerCp}
          startDate={props.startDate}
          endDate={props.endDate}
          validUntil={props.validUntil}
          isSale={props.isSale}
        />
        <LineItemsTable items={props.lineItems} currency={props.currency} />
        <TotalsBox
          subtotal={props.subtotal}
          taxRate={props.taxRate}
          taxAmount={props.taxAmount}
          total={props.total}
          currency={props.currency}
          notes={props.notes}
          validUntil={props.validUntil}
          isRental={!props.isSale}
        />
        <Footer companyName={props.company?.razon_social ?? null} />
      </Page>
    </Document>
  );
}
