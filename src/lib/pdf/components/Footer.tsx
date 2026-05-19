import { Text, View } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";

interface FooterProps {
  companyName: string | null;
  prefix?: string;
}

/**
 * Fixed footer with company line + auto pagination, rendered on every page.
 */
export function Footer({ companyName, prefix = "Documento generado electrónicamente" }: FooterProps) {
  const name = companyName || "LIFT GO";
  return (
    <View fixed style={sharedStyles.footer}>
      <Text style={sharedStyles.footerText}>{`${prefix} — ${name}`}</Text>
      <Text
        style={sharedStyles.footerText}
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
      />
    </View>
  );
}
