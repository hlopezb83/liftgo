import { Image, Text, View } from "@react-pdf/renderer";
import { format } from "date-fns";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { nowMty } from "@/lib/utils";

interface HeaderProps {
  logoBase64: string | null;
  kicker: string;
  documentNumber: string;
  metaRight?: string;
}

/**
 * Document header: logo (left) + kicker/number/date (right) + separator.
 */
export function Header({ logoBase64, kicker, documentNumber, metaRight }: HeaderProps) {
  const dateLabel = metaRight ?? `Fecha: ${format(nowMty(), "dd/MM/yyyy")}`;
  return (
    <View>
      <View style={sharedStyles.headerRow}>
        <View>
          {logoBase64 ? <Image src={logoBase64} style={sharedStyles.logo} /> : <View />}
        </View>
        <View style={sharedStyles.headerRight}>
          <Text style={sharedStyles.headerKicker}>{kicker}</Text>
          <Text style={sharedStyles.headerNumber}>{documentNumber}</Text>
          <Text style={sharedStyles.headerMeta}>{dateLabel}</Text>
        </View>
      </View>
      <View style={sharedStyles.separator} />
    </View>
  );
}
