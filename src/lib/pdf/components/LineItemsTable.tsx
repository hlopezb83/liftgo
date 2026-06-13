import { Text, View } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { applyDiscount } from "@/lib/domain/invoiceHelpers";
import type { PdfLineItem } from "@/lib/pdf/shared";

interface LineItemsTableProps {
  items: PdfLineItem[];
  currency?: string;
}

function parseDescription(raw: string): { main: string; specs: string[] } {
  const parts = String(raw || "").split("\n");
  return {
    main: parts[0] || "",
    specs: parts.slice(1).filter((l) => l.trim().length > 0).map((s) => s.replace(/^[-•]\s*/, "")),
  };
}

function discountLabel(item: PdfLineItem, fmt: (n: number) => string): string {
  if (!item.discount || item.discount <= 0) return "—";
  return item.discount_type === "$" ? `-${fmt(item.discount)}` : `-${item.discount}%`;
}

/**
 * Premium line items table with zebra striping and natural text wrap.
 * Header repeats on each new page via @react-pdf/renderer's `fixed` prop on View.
 */
export function LineItemsTable({ items, currency }: LineItemsTableProps) {
  const fmt = currency ? (n: number) => formatCurrencyWithCode(n, currency) : formatCurrency;
  const hasDiscount = items.some((it) => it.discount && it.discount > 0);

  return (
    <View>
      <View style={sharedStyles.tableHeader} fixed>
        <Text style={[sharedStyles.tableHeaderText, sharedStyles.cellDesc]}>DESCRIPCIÓN</Text>
        <Text style={[sharedStyles.tableHeaderText, sharedStyles.cellNum]}>CANT.</Text>
        <Text style={[sharedStyles.tableHeaderText, sharedStyles.cellMoney]}>P. UNITARIO</Text>
        {hasDiscount && (
          <Text style={[sharedStyles.tableHeaderText, sharedStyles.cellDiscount]}>DTO.</Text>
        )}
        <Text style={[sharedStyles.tableHeaderText, sharedStyles.cellTotal]}>TOTAL</Text>
      </View>

      {items.map((item, i) => {
        const { main, specs } = parseDescription(item.description);
        const rowStyles = i % 2 === 0
          ? [sharedStyles.tableRow, sharedStyles.tableRowAlt]
          : sharedStyles.tableRow;
        return (
          <View key={i} style={rowStyles} wrap={false}>
            <View style={sharedStyles.cellDesc}>
              <Text style={sharedStyles.cellTitle}>{main}</Text>
              {specs.map((spec, j) => (
                <Text key={j} style={sharedStyles.cellSpec}>• {spec}</Text>
              ))}
            </View>
            <Text style={[sharedStyles.cellText, sharedStyles.cellNum]}>{item.quantity}</Text>
            <Text style={[sharedStyles.cellText, sharedStyles.cellMoney]}>
              {fmt(Number(item.unit_price))}
            </Text>
            {hasDiscount && (
              <Text style={[sharedStyles.cellText, sharedStyles.cellDiscount]}>
                {discountLabel(item, fmt)}
              </Text>
            )}
            <Text style={sharedStyles.cellTotal}>{fmt(applyDiscount(item))}</Text>
          </View>
        );
      })}
    </View>
  );
}
