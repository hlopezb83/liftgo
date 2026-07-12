import { Text, View } from "@react-pdf/renderer";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";
import { DEFAULT_PAGARE } from "@/lib/pdf/contract/data-templates";
import { contractStyles } from "@/lib/pdf/theme/styles";

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
    <View style={contractStyles.pagareFieldRow}>
      <Text style={contractStyles.pagareFieldLabel}>{label}</Text>
      <Text style={contractStyles.pagareFieldValue}>{value}</Text>
    </View>
  );
}

export function PagareAnnex({ contract, tpl, vars, customer, city, formattedDate }: PagareAnnexProps) {
  return (
    <View>
      <Text style={[contractStyles.docTitle, { marginBottom: 4 }]}>PAGARÉ</Text>
      <Text style={[contractStyles.docSubtitle, { marginBottom: 14 }]}>
        Anexo B del {contract.contract_number}
      </Text>

      <View style={contractStyles.pagareHeadRow}>
        <FieldRow label="Número:" value="1/1" />
        <FieldRow label="Bueno por:" value={`$${vars.deposito}`} />
      </View>
      <FieldRow label="Lugar:" value={city} />
      <FieldRow label="Fecha:" value={formattedDate} />

      <Text style={[contractStyles.subsectionTitle, { marginTop: 12 }]}>TEXTO DEL PAGARÉ</Text>
      <Text style={contractStyles.pagareBody}>
        {replacePlaceholders(tpl.pagare_text || DEFAULT_PAGARE, vars)}
      </Text>

      <Text style={contractStyles.pagareSubsection}>1. DATOS DEL SUSCRIPTOR</Text>
      <Text style={contractStyles.pagareLine}>
        Nombre / Razón Social: {customer?.name || "______________________"}
      </Text>
      <Text style={contractStyles.pagareLine}>
        Representante Legal: {customer?.representante_legal || customer?.contact_person || "______________________"}
      </Text>
      <Text style={contractStyles.pagareLine}>
        Domicilio: {customer?.address || "______________________"}
      </Text>
      <Text style={contractStyles.pagareLineSpaced}>
        RFC: {customer?.rfc || "______________________"}
      </Text>

      <View style={contractStyles.pagareSignatureBox}>
        <Text style={contractStyles.checklistKey}>Firma del Suscriptor</Text>
      </View>

      <Text style={contractStyles.pagareSubsection}>2. DATOS DEL AVAL (Opcional)</Text>
      <Text style={contractStyles.pagareLine}>Nombre: ______________________</Text>
      <Text style={contractStyles.pagareLineSpaced}>Domicilio: ______________________</Text>
      <View style={contractStyles.pagareSignatureBox}>
        <Text style={contractStyles.checklistKey}>Firma del Aval</Text>
      </View>
    </View>
  );
}
