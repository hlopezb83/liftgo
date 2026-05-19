import { Text, View } from "@react-pdf/renderer";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";

interface ChecklistAnnexProps {
  contract: ContractData;
  tpl: TemplateData;
  forklift: {
    manufacturer?: string | null;
    model?: string | null;
    serial_number?: string | null;
    fuel_type?: string | null;
  } | null;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <Text style={{ fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", width: 140 }}>{label}</Text>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray700 }}>{value}</Text>
    </View>
  );
}

function Checkbox() {
  return (
    <View style={{
      width: 7, height: 7, borderWidth: 0.5, borderColor: COLORS.gray700,
      marginHorizontal: 3,
    }} />
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", marginBottom: 3,
      justifyContent: "space-between",
    }} wrap={false}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <Checkbox />
        <Text style={{ fontSize: FONT_SIZES.sm, marginLeft: 4 }}>{text}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: FONT_SIZES.xs }}>B</Text><Checkbox />
        <Text style={{ fontSize: FONT_SIZES.xs }}>M</Text><Checkbox />
        <Text style={{ fontSize: FONT_SIZES.xs }}>N/A</Text><Checkbox />
      </View>
    </View>
  );
}

export function ChecklistAnnex({ contract, tpl, forklift }: ChecklistAnnexProps) {
  return (
    <View>
      <Text style={{ fontSize: FONT_SIZES.xl, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 }}>
        ANEXO A: CHECKLIST DE INSPECCIÓN Y ENTREGA
      </Text>
      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.gray500, textAlign: "center", marginBottom: 12 }}>
        Parte integral del {contract.contract_number}
      </Text>

      <Text style={{ fontSize: FONT_SIZES.md, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
        I. Datos Generales
      </Text>
      <InfoLine label="Fecha y Hora de Entrega:" value="______________________" />
      <InfoLine label="Lugar de Entrega:" value={contract.usage_location || "______________________"} />
      <InfoLine label="Marca y Modelo:" value={`${forklift?.manufacturer || ""} ${forklift?.model || ""}`} />
      <InfoLine label="Número de Serie:" value={forklift?.serial_number || "______________________"} />
      <InfoLine label="Horómetro Inicial:" value="____________  Final: ____________" />
      <InfoLine label="Tipo de Combustible:" value={forklift?.fuel_type || "______________________"} />
      <InfoLine label="Nivel de Combustible Inicial:" value="______________________" />

      {tpl.checklist_sections.map((section, idx) => (
        <View key={idx} style={{ marginTop: 8 }} wrap>
          <Text style={{ fontSize: FONT_SIZES.md, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
            {section.title}
          </Text>
          {section.items.map((item, i) => (
            <ChecklistItem key={i} text={item} />
          ))}
        </View>
      ))}

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 30 }} wrap={false}>
        <View style={{ width: "45%", borderTopWidth: 0.5, borderTopColor: COLORS.gray900, paddingTop: 4 }}>
          <Text style={{ fontSize: FONT_SIZES.xs }}>Entregado por (Técnico)</Text>
        </View>
        <View style={{ width: "45%", borderTopWidth: 0.5, borderTopColor: COLORS.gray900, paddingTop: 4 }}>
          <Text style={{ fontSize: FONT_SIZES.xs }}>Recibido por (Cliente)</Text>
        </View>
      </View>
    </View>
  );
}
