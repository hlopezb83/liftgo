import { Text, View } from "@react-pdf/renderer";
import { COLORS, FONT_SIZES, PAGE_MARGIN } from "@/lib/pdf/theme/tokens";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import { DEFAULT_INTRO } from "@/lib/pdf/contract/data-templates";

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
  return (
    <Text style={{
      fontSize: FONT_SIZES.lg, fontFamily: "Helvetica-Bold",
      color: COLORS.gray900, marginTop: 10, marginBottom: 6,
    }}>{text}</Text>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <Text style={{
      fontSize: FONT_SIZES.sm, color: COLORS.gray700,
      marginLeft: 12, marginBottom: 3, lineHeight: 1.4,
    }}>•  {text}</Text>
  );
}

function SignaturePair({ leftLabel, leftName, rightLabel, rightName, rightSub }: {
  leftLabel: string; leftName: string;
  rightLabel: string; rightName: string; rightSub?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 30 }} wrap={false}>
      <View style={{ width: "45%" }}>
        <View style={{ borderTopWidth: 0.5, borderTopColor: COLORS.gray900, paddingTop: 4 }}>
          <Text style={{ fontSize: FONT_SIZES.xs, fontFamily: "Helvetica-Bold" }}>{leftLabel}</Text>
          <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.gray700 }}>{leftName}</Text>
        </View>
      </View>
      <View style={{ width: "45%" }}>
        <View style={{ borderTopWidth: 0.5, borderTopColor: COLORS.gray900, paddingTop: 4 }}>
          <Text style={{ fontSize: FONT_SIZES.xs, fontFamily: "Helvetica-Bold" }}>{rightLabel}</Text>
          <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.gray700 }}>{rightName}</Text>
          {rightSub && <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.gray700 }}>{rightSub}</Text>}
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
      <Text style={{ fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
        Declara EL ARRENDADOR:
      </Text>
      {landlord.map((d, i) => (
        <Bullet key={`l-${i}`} text={replacePlaceholders(d, vars)} />
      ))}
      <Text style={{ fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3 }}>
        Declara EL ARRENDATARIO:
      </Text>
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
        <View key={i} style={{ marginBottom: 6 }} wrap>
          <Text style={{ fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>
            {replacePlaceholders(c.title, vars)}
          </Text>
          <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray700, lineHeight: 1.4 }}>
            {replacePlaceholders(c.body, vars)}
          </Text>
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
      <Text style={{ fontSize: FONT_SIZES.xl, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 12 }}>
        CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray700, lineHeight: 1.5, marginBottom: 8 }}>
        {replacePlaceholders(tpl.intro_text || DEFAULT_INTRO, vars)}
      </Text>

      <DeclarationsSection landlord={tpl.declarations_landlord} tenant={tenantDecls} vars={vars} />
      <ClausesSection clauses={tpl.clauses} vars={vars} />

      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray700, marginTop: PAGE_MARGIN / 2 }}>
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

