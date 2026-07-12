import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { format } from "date-fns";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Footer } from "@/lib/pdf/components/Footer";
import type { TemplateData, ContractData } from "@/lib/pdf/contract/data";
import { sharedStyles, contractStyles } from "@/lib/pdf/theme/styles";
import { nowMty } from "@/lib/utils";
import { ChecklistAnnex } from "./contract/ChecklistAnnex";
import { ContractBody } from "./contract/ContractBody";
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
          <Text style={contractStyles.headerCompanyName}>
            {company?.razon_social || "Empresa"}
          </Text>
          {company?.rfc && (
            <Text style={contractStyles.headerCompanyMeta}>
              RFC: {company.rfc} | C.P. {company.lugar_expedicion || ""}
            </Text>
          )}
        </View>
      </View>
      <Text style={contractStyles.headerNumber}>{contractNumber}</Text>
    </View>
  );
}

function ContractPageWrapper({
  company, logoBase64, contractNumber, footerPrefix, children,
}: {
  company: ContractDocumentProps["company"];
  logoBase64: string | null;
  contractNumber: string;
  footerPrefix: string;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={sharedStyles.page}>
      <AccentBar />
      <ContractHeader company={company} logoBase64={logoBase64} contractNumber={contractNumber} />
      <View style={sharedStyles.separator} />
      {children}
      <Footer companyName={company?.razon_social ?? null} prefix={footerPrefix} />
    </Page>
  );
}

export function ContractDocument(props: ContractDocumentProps) {
  const { mode, contract, tpl, vars, logoBase64, company, customer, forklift } = props;
  const pages: { key: PDFMode; show: boolean }[] = [
    { key: "contract", show: mode === "full" || mode === "contract" },
    { key: "checklist", show: mode === "full" || mode === "checklist" },
    { key: "pagare", show: mode === "full" || mode === "pagare" },
  ];
  const city = vars.ciudad;
  const formattedDate = format(nowMty(), "dd/MM/yyyy");
  const wrapperProps = { company, logoBase64, contractNumber: contract.contract_number };

  return (
    <Document title={contract.contract_number}>
      {pages[0].show && (
        <ContractPageWrapper {...wrapperProps} footerPrefix="Contrato">
          <ContractBody contract={contract} tpl={tpl} vars={vars} company={company} customer={customer} city={city} formattedDate={formattedDate} />
        </ContractPageWrapper>
      )}
      {pages[1].show && (
        <ContractPageWrapper {...wrapperProps} footerPrefix="Anexo A">
          <ChecklistAnnex contract={contract} tpl={tpl} forklift={forklift} />
        </ContractPageWrapper>
      )}
      {pages[2].show && (
        <ContractPageWrapper {...wrapperProps} footerPrefix="Anexo B (Pagaré)">
          <PagareAnnex contract={contract} tpl={tpl} vars={vars} customer={customer} city={city} formattedDate={formattedDate} />
        </ContractPageWrapper>
      )}
    </Document>
  );
}

