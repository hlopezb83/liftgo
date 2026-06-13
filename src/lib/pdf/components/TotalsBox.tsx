import { Text, View } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { fmtDate } from "@/lib/pdf/shared";

interface TotalsBoxProps {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency?: string;
  notes?: string | null;
  validUntil?: string | null;
  isRental?: boolean;
  showTerms?: boolean;
}

/**
 * Totals stack (subtotal / tax / grand total) + optional terms & notes box.
 */
export function TotalsBox({
  subtotal, taxRate, taxAmount, total,
  currency, notes, validUntil, isRental, showTerms = true,
}: TotalsBoxProps) {
  const fmt = currency ? (n: number) => formatCurrencyWithCode(n, currency) : formatCurrency;
  const currencyLabel = currency || "MXN";

  const terms: string[] = [
    `Precios expresados en ${currencyLabel} antes de IVA.`,
  ];
  if (validUntil) terms.push(`Cotización válida hasta el ${fmtDate(validUntil)}.`);
  terms.push("Condiciones de pago sujetas a negociación.");
  terms.push("Tiempos de entrega confirmados al aceptar.");
  if (isRental) {
    terms.push("Equipo sujeto a 200 horas de uso mensual.");
    terms.push("Horas extras con costo adicional.");
  }

  return (
    <View wrap={false}>
      <View style={sharedStyles.totalsContainer}>
        <View style={sharedStyles.totalsRow}>
          <Text style={sharedStyles.totalsLabel}>Subtotal:</Text>
          <Text style={sharedStyles.totalsValue}>{fmt(subtotal)}</Text>
        </View>
        <View style={sharedStyles.totalsRow}>
          <Text style={sharedStyles.totalsLabel}>IVA ({taxRate}%):</Text>
          <Text style={sharedStyles.totalsValue}>{fmt(taxAmount)}</Text>
        </View>
        <View style={sharedStyles.totalsDivider} />
        <View style={sharedStyles.totalsRow}>
          <Text style={sharedStyles.totalsGrandLabel}>TOTAL:</Text>
          <Text style={sharedStyles.totalsGrandValue}>{fmt(total)} {currencyLabel}</Text>
        </View>
      </View>

      {showTerms && (
        <View style={sharedStyles.termsBox}>
          <Text style={sharedStyles.termsTitle}>TÉRMINOS, CONDICIONES Y NOTAS</Text>
          {terms.map((t, i) => (
            <Text key={i} style={sharedStyles.termsItem}>•  {t}</Text>
          ))}
          {notes && (
            <>
              <Text style={sharedStyles.notesTitle}>Notas:</Text>
              <Text style={sharedStyles.notesBody}>{notes}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}
