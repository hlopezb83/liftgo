import { Document, Page, Text, View } from "@react-pdf/renderer";
import { differenceInDays, parseISO } from "date-fns";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Header } from "@/lib/pdf/components/Header";
import { InfoCards } from "@/lib/pdf/components/InfoCards";
import { Footer } from "@/lib/pdf/components/Footer";
import { fmtDate, type CompanyData } from "@/lib/pdf/shared";
import { formatCurrency } from "@/lib/formatCurrency";
import { roundMoney } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import type { CustomerSummary } from "@/lib/domain/customerTypes";

export interface CustomerStatementDocumentProps {
  company: CompanyData | null;
  logoBase64: string | null;
  folio: string;
  customerName: string;
  customerRfc: string | null;
  customerCp: string | null;
  summary: CustomerSummary;
}

type Invoice = CustomerSummary["invoices"][number];

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", sent: "Enviada", paid: "Pagada",
  partial: "Parcial", overdue: "Vencida", cancelled: "Cancelada",
};

function pickBadge(balance: number, hasOverdue: boolean): { label: string; bg: string; color: string } {
  if (balance <= 0) return { label: "PAGADO", bg: COLORS.badgeOk.fill, color: COLORS.badgeOk.text };
  if (hasOverdue) return { label: "VENCIDO", bg: COLORS.badgeBad.fill, color: COLORS.badgeBad.text };
  return { label: "CON SALDO", bg: COLORS.badgeWarn.fill, color: COLORS.badgeWarn.text };
}

function SummaryCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{
      flex: 1, padding: 10, borderRadius: 3, borderWidth: 0.5,
      borderColor: COLORS.gray200, backgroundColor: COLORS.gray50,
    }}>
      <Text style={{ fontSize: FONT_SIZES.xxs, color: COLORS.gray500, fontFamily: "Helvetica-Bold" }}>{label}</Text>
      <Text style={{
        fontSize: FONT_SIZES.lg, fontFamily: "Helvetica-Bold",
        color: danger ? COLORS.badgeBad.text : COLORS.gray900, marginTop: 6,
      }}>{value}</Text>
    </View>
  );
}

function InvoiceTable({ title, rows, showDue, emptyMsg }: {
  title: string; rows: Invoice[]; showDue: boolean; emptyMsg?: string;
}) {
  const today = nowMty();
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={[sharedStyles.termsTitle, { fontSize: FONT_SIZES.sm }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[sharedStyles.cellText, { color: COLORS.gray500, marginTop: 6 }]}>
          {emptyMsg ?? "Sin registros."}
        </Text>
      ) : (
        <View style={{ marginTop: 4 }}>
          <View style={sharedStyles.tableHeader}>
            <Text style={[sharedStyles.tableHeaderText, { flex: 1 }]}>Folio</Text>
            <Text style={[sharedStyles.tableHeaderText, { width: 70 }]}>Emisión</Text>
            {showDue && <Text style={[sharedStyles.tableHeaderText, { width: 70 }]}>Vencimiento</Text>}
            {showDue && <Text style={[sharedStyles.tableHeaderText, { width: 50, textAlign: "center" }]}>Días</Text>}
            <Text style={[sharedStyles.tableHeaderText, { width: 60 }]}>Estado</Text>
            <Text style={[sharedStyles.tableHeaderText, { width: 80, textAlign: "right" }]}>Total</Text>
          </View>
          {rows.map((inv, i) => {
            const days = inv.due_date ? differenceInDays(today, parseISO(inv.due_date)) : 0;
            const dayLabel = inv.due_date
              ? days > 0 ? `${days} venc.` : `${Math.abs(days)} rest.`
              : "—";
            const rowStyles = i % 2 === 0
              ? [sharedStyles.tableRow, sharedStyles.tableRowAlt]
              : sharedStyles.tableRow;
            return (
              <View key={inv.id} style={rowStyles} wrap={false}>
                <Text style={[sharedStyles.cellText, { flex: 1 }]}>{inv.invoice_number}</Text>
                <Text style={[sharedStyles.cellText, { width: 70 }]}>{fmtDate(inv.issued_at)}</Text>
                {showDue && <Text style={[sharedStyles.cellText, { width: 70 }]}>{fmtDate(inv.due_date)}</Text>}
                {showDue && <Text style={[sharedStyles.cellText, { width: 50, textAlign: "center" }]}>{dayLabel}</Text>}
                <Text style={[sharedStyles.cellText, { width: 60 }]}>{STATUS_LABELS[inv.status] ?? inv.status}</Text>
                <Text style={[sharedStyles.cellTotal, { width: 80 }]}>{formatCurrency(Number(inv.total))}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function CustomerStatementDocument(props: CustomerStatementDocumentProps) {
  const { summary } = props;
  const totalInvoiced = roundMoney(Number(summary.totals.total_invoiced ?? 0));
  const totalPaid = roundMoney(Number(summary.totals.total_paid ?? 0));
  const balance = roundMoney(totalInvoiced - totalPaid);
  const today = nowMty();
  const openInvoices = summary.invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const paidInvoices = summary.invoices.filter((i) => i.status === "paid");
  const hasOverdue = openInvoices.some((i) => i.due_date && differenceInDays(today, parseISO(i.due_date)) > 0);
  const badge = pickBadge(balance, hasOverdue);

  return (
    <Document title={`Estado de cuenta — ${props.customerName}`}>
      <Page size="A4" style={sharedStyles.page}>
        <AccentBar />
        <Header logoBase64={props.logoBase64} kicker="ESTADO DE CUENTA" documentNumber={props.folio} />
        <InfoCards
          company={props.company}
          customerName={props.customerName}
          customerRfc={props.customerRfc}
          customerCp={props.customerCp}
          isSale
        />

        <View style={{ alignItems: "flex-end", marginBottom: 4 }}>
          <Text style={[sharedStyles.badge, { backgroundColor: badge.bg, color: badge.color }]}>
            {badge.label}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <SummaryCard label="TOTAL FACTURADO" value={formatCurrency(totalInvoiced)} />
          <SummaryCard label="TOTAL PAGADO" value={formatCurrency(totalPaid)} />
          <SummaryCard label="SALDO PENDIENTE" value={formatCurrency(balance)} danger={balance > 0} />
        </View>

        <InvoiceTable title="FACTURAS PENDIENTES" rows={openInvoices} showDue emptyMsg="Sin facturas pendientes." />
        <InvoiceTable title="FACTURAS PAGADAS" rows={paidInvoices} showDue={false} />

        <Footer companyName={props.company?.razon_social ?? null} prefix="Estado de cuenta" />
      </Page>
    </Document>
  );
}
