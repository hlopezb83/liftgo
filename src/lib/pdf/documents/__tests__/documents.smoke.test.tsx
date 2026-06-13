/**
 * Smoke + snapshot estructural de los 5 Documents PDF.
 * Mocks @react-pdf/renderer a tags React planos vía vi.mock al inicio.
 */
import "./__mocks__/reactPdf";
import { describe, it, expect } from "vitest";
import renderer from "react-test-renderer";
import {
  company, lineItems, totals, customerSummary,
  incomeStatement, contract, template,
} from "./__fixtures__/pdfFixtures";

import { QuoteDocument } from "../QuoteDocument";
import { InvoiceDocument } from "../InvoiceDocument";
import { CustomerStatementDocument } from "../CustomerStatementDocument";
import { IncomeStatementDocument } from "../IncomeStatementDocument";
import { ContractDocument } from "../ContractDocument";

function renderJson(el: React.ReactElement) {
  let tree: renderer.ReactTestRenderer | null = null;
  renderer.act(() => { tree = renderer.create(el); });
  expect(tree).not.toBeNull();
  const json = tree!.toJSON();
  tree!.unmount();
  return json;
}

describe("PDF Documents — smoke", () => {
  it("QuoteDocument renderiza sin lanzar", () => {
    const json = renderJson(
      <QuoteDocument
        company={company}
        logoBase64={null}
        quoteNumber="COT-0001"
        customerName="Cliente Demo SA"
        customerRfc="XAXX010101000"
        customerCp="64000"
        startDate="2026-01-01"
        endDate="2026-01-31"
        validUntil="2026-02-15"
        isSale={false}
        lineItems={lineItems}
        subtotal={totals.subtotal}
        taxRate={totals.taxRate}
        taxAmount={totals.taxAmount}
        total={totals.total}
        currency="MXN"
        notes={null}
      />,
    );
    expect(json).toMatchSnapshot();
  });

  it("InvoiceDocument: estado pagado sin CFDI", () => {
    const json = renderJson(
      <InvoiceDocument
        company={company}
        logoBase64={null}
        invoiceLabel="FAC-0001"
        customerName="Cliente Demo SA"
        customerRfc="XAXX010101000"
        customerCp="64000"
        issuedAt="2026-01-01"
        dueDate="2026-01-31"
        status="paid"
        formaPago="03"
        metodoPago="PUE"
        cfdiStatus={null}
        cfdiUuid={null}
        lineItems={lineItems}
        subtotal={totals.subtotal}
        taxRate={totals.taxRate}
        taxAmount={totals.taxAmount}
        total={totals.total}
        currency="MXN"
        notes={null}
      />,
    );
    expect(json).toMatchSnapshot();
  });

  it("InvoiceDocument: timbrada con UUID muestra SatBadge y CfdiBox", () => {
    const json = renderJson(
      <InvoiceDocument
        company={company}
        logoBase64={null}
        invoiceLabel="FAC-0002"
        customerName="Cliente Demo SA"
        customerRfc="XAXX010101000"
        customerCp="64000"
        issuedAt="2026-02-01"
        dueDate={null}
        status="sent"
        formaPago={null}
        metodoPago={null}
        cfdiStatus="stamped"
        cfdiUuid="abcdef12-3456-7890-abcd-ef1234567890"
        lineItems={lineItems}
        subtotal={totals.subtotal}
        taxRate={totals.taxRate}
        taxAmount={totals.taxAmount}
        total={totals.total}
        currency="MXN"
        notes="Gracias por su compra."
      />,
    );
    expect(json).toMatchSnapshot();
  });

  it("CustomerStatementDocument con saldo pendiente", () => {
    const json = renderJson(
      <CustomerStatementDocument
        company={company}
        logoBase64={null}
        folio="EC-0001"
        customerName="Cliente Demo SA"
        customerRfc="XAXX010101000"
        customerCp="64000"
        summary={customerSummary}
      />,
    );
    expect(json).toMatchSnapshot();
  });

  it("IncomeStatementDocument: vista anual normal", () => {
    const json = renderJson(
      <IncomeStatementDocument
        company={company}
        logoBase64={null}
        filteredData={incomeStatement.filteredData}
        statementRows={incomeStatement.statementRows}
        comparisonRows={incomeStatement.comparisonRows}
        yearTotals={incomeStatement.yearTotals}
        isComparison={false}
        selectedYear="2026"
        availableYears={["2025", "2026"]}
        startDate={new Date("2026-01-01")}
        endDate={new Date("2026-12-31")}
      />,
    );
    expect(json).toMatchSnapshot();
  });

  it("IncomeStatementDocument: vista comparativa entre años", () => {
    const json = renderJson(
      <IncomeStatementDocument
        company={company}
        logoBase64={null}
        filteredData={incomeStatement.filteredData}
        statementRows={incomeStatement.statementRows}
        comparisonRows={incomeStatement.comparisonRows}
        yearTotals={incomeStatement.yearTotals}
        isComparison
        selectedYear="compare"
        availableYears={["2025", "2026"]}
        startDate={new Date("2025-01-01")}
        endDate={new Date("2026-12-31")}
      />,
    );
    expect(json).toMatchSnapshot();
  });

  it("ContractDocument modo full (3 páginas)", () => {
    const json = renderJson(
      <ContractDocument
        mode="full"
        contract={contract}
        tpl={template}
        vars={{ ciudad: "Monterrey" }}
        logoBase64={null}
        company={company}
        customer={{ name: "Cliente Demo SA", representante_legal: "Juan Pérez", contact_person: null, address: "Calle X 123", rfc: "XAXX010101000" }}
        forklift={{ manufacturer: "Toyota", model: "8FGCU25", serial_number: "SN-001", fuel_type: "lpg" }}
      />,
    );
    expect(json).toMatchSnapshot();
  });
});
