import { View } from "@react-pdf/renderer";
import { sharedStyles } from "@/lib/pdf/theme/styles";

export function AccentBar() {
  return <View fixed style={sharedStyles.accentBar} />;
}
