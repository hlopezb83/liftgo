import { Text, View } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import type { CompanyData } from "@/lib/pdf/shared";
import { fmtDate } from "@/lib/pdf/shared";

interface InfoCardsProps {
  company: CompanyData | null;
  customerName: string | null;
  customerRfc?: string | null;
  customerCp?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  validUntil?: string | null;
  isSale?: boolean;
}

/**
 * Issuer (left) + Customer (right) info cards. Includes period/vigencia when rental.
 */
export function InfoCards({
  company, customerName, customerRfc, customerCp,
  startDate, endDate, validUntil, isSale = false,
}: InfoCardsProps) {
  return (
    <View style={sharedStyles.infoCardsRow}>
      <View style={sharedStyles.infoCard}>
        <Text style={sharedStyles.infoLabel}>EMISOR</Text>
        <Text style={sharedStyles.infoName}>{company?.razon_social || "—"}</Text>
        {company && <Text style={sharedStyles.infoLine}>RFC: {company.rfc}</Text>}
        {company && <Text style={sharedStyles.infoLine}>C.P. {company.lugar_expedicion}</Text>}
        {company && <Text style={sharedStyles.infoLine}>Régimen: {company.regimen_fiscal}</Text>}
      </View>
      <View style={sharedStyles.infoCard}>
        <Text style={sharedStyles.infoLabel}>CLIENTE</Text>
        <Text style={sharedStyles.infoName}>{customerName || "—"}</Text>
        {customerRfc && <Text style={sharedStyles.infoLine}>RFC: {customerRfc}</Text>}
        {customerCp && <Text style={sharedStyles.infoLine}>C.P. {customerCp}</Text>}
        {!isSale && startDate && endDate && (
          <Text style={sharedStyles.infoLine}>Período: {fmtDate(startDate)} — {fmtDate(endDate)}</Text>
        )}
        {validUntil && (
          <Text style={sharedStyles.infoLine}>Vigencia hasta: {fmtDate(validUntil)}</Text>
        )}
      </View>
    </View>
  );
}
