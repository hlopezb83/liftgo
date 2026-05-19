import { Document, Page, Text, View } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Header } from "@/lib/pdf/components/Header";
import { InfoCards } from "@/lib/pdf/components/InfoCards";
import { LineItemsTable } from "@/lib/pdf/components/LineItemsTable";
import { TotalsBox } from "@/lib/pdf/components/TotalsBox";
import { Footer } from "@/lib/pdf/components/Footer";
import { fmtDate, type CompanyData, type PdfLineItem } from "@/lib/pdf/shared";

export interface InvoiceDocumentProps {
  company: CompanyData | null;
  logoBase64: string | null;
  invoiceLabel: string;
  customerName: string | null;
  customerRfc: string | null;
  customerCp: string | null;
  issuedAt: string | null;
  dueDate: string | null;
  status: string;
  formaPago: string | null;
  metodoPago: string | null;
  cfdiStatus: string | null;
  cfdiUuid: string | null;
  lineItems: PdfLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  paid: "PAGADA",
  cancelled: "CANCELADA",
};

const STATUS_FILLS: Record<string, string> = {
  paid: COLORS.accentGreen,
  cancelled: COLORS.destructive,
};

function statusLabel(s: string): string { return STATUS_LABELS[s] ?? "PENDIENTE"; }
function statusFill(s: string): string { return STATUS_FILLS[s] ?? COLORS.warningAmber; }

function SatBadge({ uuid }: { uuid: string }) {
  return (
    <View style={{ alignItems: "flex-end", marginBottom: 6 }}>
      <Text style={[sharedStyles.badge, { backgroundColor: COLORS.accentGreen, color: COLORS.white }]}>
        TIMBRADO SAT
      </Text>
      <Text style={[sharedStyles.footerText, { marginTop: 3 }]}>UUID: {uuid}</Text>
    </View>
  );
}

function DetailRow(props: InvoiceDocumentProps) {
  const pago = [props.formaPago, props.metodoPago].filter(Boolean).join(" • ");
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Text style={sharedStyles.cellText}>
          <Text style={sharedStyles.bold}>Emitida: </Text>{fmtDate(props.issuedAt)}
        </Text>
        <Text style={sharedStyles.cellText}>
          <Text style={sharedStyles.bold}>Vence: </Text>{fmtDate(props.dueDate)}
        </Text>
        <Text style={[
          sharedStyles.badge,
          { backgroundColor: statusFill(props.status), color: COLORS.white },
        ]}>
          {statusLabel(props.status)}
        </Text>
      </View>
      {pago && <Text style={[sharedStyles.cellText, { color: COLORS.gray500 }]}>{pago}</Text>}
    </View>
  );
}

function CfdiBox({ uuid }: { uuid: string }) {
  return (
    <View
      wrap={false}
      style={{
        marginTop: 12, padding: 8,
        borderWidth: 0.5, borderColor: COLORS.gray200, borderRadius: 3,
      }}
    >
      <Text style={{ fontSize: FONT_SIZES.xxs, color: COLORS.gray500 }}>
        Este documento es una representación impresa de un CFDI.
      </Text>
      <Text style={{ fontSize: FONT_SIZES.xxs, color: COLORS.gray500, marginTop: 2 }}>
        UUID: {uuid}
      </Text>
      <Text style={{ fontSize: FONT_SIZES.xxs, color: COLORS.gray500, marginTop: 2 }}>
        Verificar en: https://verificacfdi.facturaelectronica.sat.gob.mx
      </Text>
    </View>
  );
}

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const isStamped = props.cfdiStatus === "stamped" && !!props.cfdiUuid;
  return (
    <Document title={props.invoiceLabel} author={props.company?.razon_social ?? "LiftGo"}>
      <Page size="A4" style={sharedStyles.page}>
        <AccentBar />
        <Header logoBase64={props.logoBase64} kicker="FACTURA" documentNumber={props.invoiceLabel} />
        {isStamped && props.cfdiUuid && <SatBadge uuid={props.cfdiUuid} />}
        <InfoCards
          company={props.company}
          customerName={props.customerName}
          customerRfc={props.customerRfc}
          customerCp={props.customerCp}
          isSale
        />
        <DetailRow {...props} />
        <LineItemsTable items={props.lineItems} currency={props.currency} />
        <TotalsBox
          subtotal={props.subtotal}
          taxRate={props.taxRate}
          taxAmount={props.taxAmount}
          total={props.total}
          currency={props.currency}
          notes={props.notes}
          showTerms={false}
        />
        {isStamped && props.cfdiUuid && <CfdiBox uuid={props.cfdiUuid} />}
        <Footer companyName={props.company?.razon_social ?? null} />
      </Page>
    </Document>
  );
}
