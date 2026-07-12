import { Text, View } from "@react-pdf/renderer";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";
import { DEFAULT_INTRO } from "@/lib/pdf/contract/data-templates";
import { contractStyles } from "@/lib/pdf/theme/styles";
import { PAGE_MARGIN } from "@/lib/pdf/theme/tokens";

interface PartiesContractBodyProps {
  contract: ContractData;
  tpl: TemplateData;
  vars: Record<string, string>;
  company: { razon_social?: string | null } | null;
  customer: {
    name?: string | null;
    representante_legal?: string | null;
  } | null;
  city: string;
  formattedDate: string;
}

function SectionTitle({ text }: { text: string }) {
  return <Text style={contractStyles.sectionTitle}>{text}</Text>;
}

function Bullet({ text }: { text: string }) {
  return <Text style={contractStyles.bullet}>•  {text}</Text>;
}

function SignaturePair({ leftLabel, leftName, rightLabel, rightName, rightSub }: {
  leftLabel: string; leftName: string;
  rightLabel: string; rightName: string; rightSub?: string;
}) {
  return (
    <View style={contractStyles.signatureRow} wrap={false}>
      <View style={contractStyles.signatureCol}>
        <View style={contractStyles.signatureBox}>
          <Text style={contractStyles.signatureLabel}>{leftLabel}</Text>
          <Text style={contractStyles.signatureName}>{leftName}</Text>
        </View>
      </View>
      <View style={contractStyles.signatureCol}>
        <View style={contractStyles.signatureBox}>
          <Text style={contractStyles.signatureLabel}>{rightLabel}</Text>
          <Text style={contractStyles.signatureName}>{rightName}</Text>
          {rightSub && <Text style={contractStyles.signatureName}>{rightSub}</Text>}
        </View>
      </View>
    </View>
  );
}

function DeclarationsSection({
  landlord, tenant, vars,
}: { landlord: string[]; tenant: string[]; vars: Record<string, string> }) {
  return (
    <>
      <SectionTitle text="I. DECLARACIONES" />
      <Text style={contractStyles.declarationLabel}>Declara EL ARRENDADOR:</Text>
      {landlord.map((d, i) => (
        <Bullet key={`l-${i}`} text={replacePlaceholders(d, vars)} />
      ))}
      <Text style={[contractStyles.declarationLabel, { marginTop: 6 }]}>Declara EL ARRENDATARIO:</Text>
      {tenant.map((d, i) => (
        <Bullet key={`t-${i}`} text={replacePlaceholders(d, vars)} />
      ))}
    </>
  );
}

function ClausesSection({
  clauses, vars,
}: { clauses: TemplateData["clauses"]; vars: Record<string, string> }) {
  return (
    <>
      <SectionTitle text="II. CLÁUSULAS" />
      {clauses.map((c, i) => (
        <View key={i} style={contractStyles.clauseBlock} wrap>
          <Text style={contractStyles.clauseTitle}>{replacePlaceholders(c.title, vars)}</Text>
          <Text style={contractStyles.clauseBody}>{replacePlaceholders(c.body, vars)}</Text>
        </View>
      ))}
    </>
  );
}

function buildTenantDecls(
  base: string[],
  customer: PartiesContractBodyProps["customer"],
): string[] {
  const decls = [...base];
  if (customer?.representante_legal && !decls.some((d) => d.includes("{representante_legal}"))) {
    decls.push("Representada legalmente por: {representante_legal}.");
  }
  return decls;
}

export function ContractBody({ contract, tpl, vars, company, customer, city, formattedDate }: PartiesContractBodyProps) {
  const tenantDecls = buildTenantDecls(tpl.declarations_tenant, customer);
  const rightSub = customer?.representante_legal ? `Rep. Legal: ${customer.representante_legal}` : undefined;

  return (
    <View>
      <Text style={contractStyles.docTitle}>
        CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO
      </Text>
      <Text style={contractStyles.intro}>
        {replacePlaceholders(tpl.intro_text || DEFAULT_INTRO, vars)}
      </Text>

      <DeclarationsSection landlord={tpl.declarations_landlord} tenant={tenantDecls} vars={vars} />
      <ClausesSection clauses={tpl.clauses} vars={vars} />

      <Text style={[contractStyles.closingLine, { marginTop: PAGE_MARGIN / 2 }]}>
        Leído el presente contrato, lo firman en {city}, el día {formattedDate}.
      </Text>

      <SignaturePair
        leftLabel="EL ARRENDADOR"
        leftName={company?.razon_social || ""}
        rightLabel="EL ARRENDATARIO"
        rightName={customer?.name || contract.customer_name || ""}
        rightSub={rightSub}
      />
      <SignaturePair
        leftLabel="TESTIGO 1"
        leftName={contract.witness_1 || ""}
        rightLabel="TESTIGO 2"
        rightName={contract.witness_2 || ""}
      />
    </View>
  );
}
