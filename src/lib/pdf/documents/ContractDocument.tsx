import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { format } from "date-fns";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Footer } from "@/lib/pdf/components/Footer";
import { nowMty } from "@/lib/utils";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";
import { ContractBody } from "./contract/ContractBody";
import { ChecklistAnnex } from "./contract/ChecklistAnnex";
import { PagareAnnex } from "./contract/PagareAnnex";

export type PDFMode = "full" | "contract" | "checklist" | "pagare";

export interface ContractDocumentProps {
  mode: PDFMode;
  contract: ContractData;
  tpl: TemplateData;
  vars: Record<string, string>;
  logoBase64: string | null;
  company: {
    razon_social?: string | null;
    rfc?: string | null;
    lugar_expedicion?: string | null;
  } | null;
  customer: {
    name?: string | null;
    representante_legal?: string | null;
    contact_person?: string | null;
    address?: string | null;
    rfc?: string | null;
  } | null;
  forklift: {
    manufacturer?: string | null;
    model?: string | null;
    serial_number?: string | null;
    fuel_type?: string | null;
  } | null;
}

function ContractHeader({ company, logoBase64, contractNumber }: {
  company: ContractDocumentProps["company"];
  logoBase64: string | null;
  contractNumber: string;
}) {
  return (
    <View style={sharedStyles.headerRow} fixed>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {logoBase64 && <Image src={logoBase64} style={sharedStyles.logo} />}
        <View>
          <Text style={{ fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", color: COLORS.gray900 }}>
            {company?.razon_social || "Empresa"}
          </Text>
          {company?.rfc && (
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.gray500 }}>
              RFC: {company.rfc} | C.P. {company.lugar_expedicion || ""}
            </Text>
          )}
        </View>
      </View>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.gray500 }}>{contractNumber}</Text>
    </View>
  );
}

export function ContractDocument(props: ContractDocumentProps) {
  const wantsContract = props.mode === "full" || props.mode === "contract";
  const wantsChecklist = props.mode === "full" || props.mode === "checklist";
  const wantsPagare = props.mode === "full" || props.mode === "pagare";
  const city = props.vars.ciudad;
  const formattedDate = format(nowMty(), "dd/MM/yyyy");

  return (
    <Document title={props.contract.contract_number}>
      {wantsContract && (
        <Page size="A4" style={sharedStyles.page}>
          <AccentBar />
          <ContractHeader company={props.company} logoBase64={props.logoBase64} contractNumber={props.contract.contract_number} />
          <View style={sharedStyles.separator} />
          <ContractBody
            contract={props.contract}
            tpl={props.tpl}
            vars={props.vars}
            company={props.company}
            customer={props.customer}
            city={city}
            formattedDate={formattedDate}
          />
          <Footer companyName={props.company?.razon_social ?? null} prefix="Contrato" />
        </Page>
      )}
      {wantsChecklist && (
        <Page size="A4" style={sharedStyles.page}>
          <AccentBar />
          <ContractHeader company={props.company} logoBase64={props.logoBase64} contractNumber={props.contract.contract_number} />
          <View style={sharedStyles.separator} />
          <ChecklistAnnex contract={props.contract} tpl={props.tpl} forklift={props.forklift} />
          <Footer companyName={props.company?.razon_social ?? null} prefix="Anexo A" />
        </Page>
      )}
      {wantsPagare && (
        <Page size="A4" style={sharedStyles.page}>
          <AccentBar />
          <ContractHeader company={props.company} logoBase64={props.logoBase64} contractNumber={props.contract.contract_number} />
          <View style={sharedStyles.separator} />
          <PagareAnnex
            contract={props.contract}
            tpl={props.tpl}
            vars={props.vars}
            customer={props.customer}
            city={city}
            formattedDate={formattedDate}
          />
          <Footer companyName={props.company?.razon_social ?? null} prefix="Anexo B (Pagaré)" />
        </Page>
      )}
    </Document>
  );
}
