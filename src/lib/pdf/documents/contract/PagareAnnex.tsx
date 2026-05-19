import { Text, View } from "@react-pdf/renderer";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import { DEFAULT_PAGARE } from "@/lib/pdf/contract/data-templates";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";

interface PagareAnnexProps {
  contract: ContractData;
  tpl: TemplateData;
  vars: Record<string, string>;
  customer: {
    name?: string | null;
    representante_legal?: string | null;
    contact_person?: string | null;
    address?: string | null;
    rfc?: string | null;
  } | null;
  city: string;
  formattedDate: string;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <Text style={{ fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", width: 90 }}>{label}</Text>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray700 }}>{value}</Text>
    </View>
  );
}

export function PagareAnnex({ contract, tpl, vars, customer, city, formattedDate }: PagareAnnexProps) {
  return (
    <View>
      <Text style={{ fontSize: FONT_SIZES.xl, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 }}>
        PAGARÉ
      </Text>
      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.gray500, textAlign: "center", marginBottom: 14 }}>
        Anexo B del {contract.contract_number}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <FieldRow label="Número:" value="1/1" />
        <FieldRow label="Bueno por:" value={`$${vars.deposito}`} />
      </View>
      <FieldRow label="Lugar:" value={city} />
      <FieldRow label="Fecha:" value={formattedDate} />

      <Text style={{ fontSize: FONT_SIZES.md, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 6 }}>
        TEXTO DEL PAGARÉ
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray700, lineHeight: 1.5 }}>
        {replacePlaceholders(tpl.pagare_text || DEFAULT_PAGARE, vars)}
      </Text>

      <Text style={{ fontSize: FONT_SIZES.md, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 }}>
        1. DATOS DEL SUSCRIPTOR
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, marginBottom: 3 }}>
        Nombre / Razón Social: {customer?.name || "______________________"}
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, marginBottom: 3 }}>
        Representante Legal: {customer?.representante_legal || customer?.contact_person || "______________________"}
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, marginBottom: 3 }}>
        Domicilio: {customer?.address || "______________________"}
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, marginBottom: 12 }}>
        RFC: {customer?.rfc || "______________________"}
      </Text>

      <View style={{ width: "50%", borderTopWidth: 0.5, borderTopColor: COLORS.gray900, paddingTop: 4 }}>
        <Text style={{ fontSize: FONT_SIZES.xs }}>Firma del Suscriptor</Text>
      </View>

      <Text style={{ fontSize: FONT_SIZES.md, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 }}>
        2. DATOS DEL AVAL (Opcional)
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, marginBottom: 3 }}>Nombre: ______________________</Text>
      <Text style={{ fontSize: FONT_SIZES.sm, marginBottom: 12 }}>Domicilio: ______________________</Text>
      <View style={{ width: "50%", borderTopWidth: 0.5, borderTopColor: COLORS.gray900, paddingTop: 4 }}>
        <Text style={{ fontSize: FONT_SIZES.xs }}>Firma del Aval</Text>
      </View>
    </View>
  );
}
