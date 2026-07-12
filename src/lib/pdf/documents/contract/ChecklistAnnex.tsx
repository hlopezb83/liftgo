import { Text, View } from "@react-pdf/renderer";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";
import { contractStyles } from "@/lib/pdf/theme/styles";

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
    <View style={contractStyles.infoLineRow}>
      <Text style={contractStyles.infoLineLabel}>{label}</Text>
      <Text style={contractStyles.infoLineValue}>{value}</Text>
    </View>
  );
}

function Checkbox() {
  return <View style={contractStyles.checkbox} />;
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <View style={contractStyles.checklistItemRow} wrap={false}>
      <View style={contractStyles.checklistItemLeft}>
        <Checkbox />
        <Text style={contractStyles.checklistItemText}>{text}</Text>
      </View>
      <View style={contractStyles.checklistItemRight}>
        <Text style={contractStyles.checklistKey}>B</Text><Checkbox />
        <Text style={contractStyles.checklistKey}>M</Text><Checkbox />
        <Text style={contractStyles.checklistKey}>N/A</Text><Checkbox />
      </View>
    </View>
  );
}

export function ChecklistAnnex({ contract, tpl, forklift }: ChecklistAnnexProps) {
  return (
    <View>
      <Text style={[contractStyles.docTitle, { marginBottom: 4 }]}>
        ANEXO A: CHECKLIST DE INSPECCIÓN Y ENTREGA
      </Text>
      <Text style={contractStyles.docSubtitle}>
        Parte integral del {contract.contract_number}
      </Text>

      <Text style={contractStyles.subsectionTitle}>I. Datos Generales</Text>
      <InfoLine label="Fecha y Hora de Entrega:" value="______________________" />
      <InfoLine label="Lugar de Entrega:" value={contract.usage_location || "______________________"} />
      <InfoLine label="Marca y Modelo:" value={`${forklift?.manufacturer || ""} ${forklift?.model || ""}`} />
      <InfoLine label="Número de Serie:" value={forklift?.serial_number || "______________________"} />
      <InfoLine label="Horómetro Inicial:" value="____________  Final: ____________" />
      <InfoLine label="Tipo de Combustible:" value={forklift?.fuel_type || "______________________"} />
      <InfoLine label="Nivel de Combustible Inicial:" value="______________________" />

      {tpl.checklist_sections.map((section, idx) => (
        <View key={idx} style={contractStyles.checklistSection} wrap>
          <Text style={[contractStyles.subsectionTitle, { marginBottom: 4 }]}>{section.title}</Text>
          {section.items.map((item, i) => (
            <ChecklistItem key={i} text={item} />
          ))}
        </View>
      ))}

      <View style={contractStyles.signatureRow} wrap={false}>
        <View style={contractStyles.checklistFooterCol}>
          <Text style={contractStyles.checklistKey}>Entregado por (Técnico)</Text>
        </View>
        <View style={contractStyles.checklistFooterCol}>
          <Text style={contractStyles.checklistKey}>Recibido por (Cliente)</Text>
        </View>
      </View>
    </View>
  );
}
