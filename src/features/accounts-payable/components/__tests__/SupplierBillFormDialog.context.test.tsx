import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useForm, useWatch } from "react-hook-form";
import type { SupplierBillFormData } from "../../hooks/useSupplierBillForm";
const mocks = vi.hoisted(() => ({ importXml: vi.fn(), reset: vi.fn() }));
vi.mock("../../hooks/useImportSupplierBillCfdi", () => ({
  useImportSupplierBillCfdi: () => ({
    importXml: mocks.importXml,
    reset: mocks.reset,
    busy: false,
    error: null,
    result: null,
  }),
}));
vi.mock("@/features/company-settings", () => ({
  useCxpApprovalThreshold: () => ({ data: { threshold: 0 } }),
}));
vi.mock("../SupplierBillCfdiDropzone", () => ({
  SupplierBillCfdiDropzone: ({
    onFile,
    onClear,
  }: {
    onFile: (file: File) => void;
    onClear: () => void;
  }) => (
    <>
      <button type="button" onClick={() => onFile(new File(["xml"], "qa.xml"))}>
        Importar QA
      </button>
      <button type="button" onClick={onClear}>
        Quitar XML
      </button>
    </>
  ),
}));
vi.mock("../SupplierBillTotalPanel", () => ({
  SupplierBillTotalPanel: () => null,
}));
vi.mock("../SupplierBillFormFields", () => ({
  SupplierBillFormFields: () => null,
}));
vi.mock("@/components/forms/fields", () => ({
  SupplierField: () => null,
  TextareaField: () => null,
}));
vi.mock("../../hooks/useSupplierBillForm", () => ({
  useSupplierBillForm: () => {
    const form = useForm<SupplierBillFormData>({
      defaultValues: {
        supplier_id: "manual-supplier",
        category: "manual-category",
        description: "Manual before",
        issue_date: new Date("2026-10-01"),
        currency: "MXN",
        exchange_rate: 1,
        subtotal: 40,
        discount: 0,
        tax_amount: 0,
        retention_iva: 0,
        retention_isr: 0,
        cfdi_uuid: "",
      },
    });
    const values = useWatch({ control: form.control });
    return {
      form,
      selectedSupplier: null,
      suggestedDueDate: null,
      total: 0,
      isPending: false,
      onSubmit: vi.fn(),
      values,
    };
  },
}));
// Use the actual dialog and import/clear handlers; inspect its real RHF context.
vi.mock("@/components/ui/form", async () => {
  const rhf = await import("react-hook-form");
  return {
    Form: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <rhf.FormProvider
        {...(props as unknown as import("react-hook-form").UseFormReturn<SupplierBillFormData>)}
      >
        <Probe />
        {children}
      </rhf.FormProvider>
    ),
  };
});
function Probe() {
  const { register, control } = useFormContext();
  const values = useWatch({ control });
  return (
    <>
      <input aria-label="Manual description" {...register("description")} />
      <input aria-label="Manual category" {...register("category")} />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </>
  );
}
import { useFormContext } from "react-hook-form";
import { SupplierBillFormDialog } from "../SupplierBillFormDialog";
function values() {
  return JSON.parse(screen.getByTestId("values").textContent!);
}
describe("Supplier XML removal preserves manual context", () => {
  it("restores pre-import values and keeps fields edited after import", async () => {
    mocks.importXml.mockResolvedValue({
      initialValues: {
        description: "XML original",
        subtotal: 100,
        cfdi_uuid: "qa-uuid",
        issue_date: new Date("2026-10-02"),
      },
      uploaded: { path: "qa.xml" },
    });
    render(<SupplierBillFormDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar QA" }));
    await waitFor(() => expect(values().subtotal).toBe(100));
    expect(values().category).toBe("manual-category");
    fireEvent.change(screen.getByLabelText("Manual description"), {
      target: { value: "Manual after" },
    });
    fireEvent.change(screen.getByLabelText("Manual category"), {
      target: { value: "category-after" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quitar XML" }));
    expect(values()).toMatchObject({
      description: "Manual after",
      category: "category-after",
      supplier_id: "manual-supplier",
      subtotal: 40,
      cfdi_uuid: "",
    });
    expect(values().issue_date).toBe(new Date("2026-10-01").toISOString());
  });
  it("restores an overwritten manual description when imported value was not edited", async () => {
    mocks.importXml.mockResolvedValue({
      initialValues: {
        description: "XML original",
        subtotal: 100,
        cfdi_uuid: "qa-uuid",
      },
      uploaded: { path: "qa.xml" },
    });
    render(<SupplierBillFormDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar QA" }));
    await waitFor(() => expect(values().subtotal).toBe(100));
    fireEvent.click(screen.getByRole("button", { name: "Quitar XML" }));
    expect(values()).toMatchObject({
      description: "Manual before",
      subtotal: 40,
      cfdi_uuid: "",
    });
  });
  it("does not clear manually captured data when there is no imported snapshot", () => {
    render(<SupplierBillFormDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar XML" }));
    expect(values()).toMatchObject({
      description: "Manual before",
      category: "manual-category",
      subtotal: 40,
    });
  });
});

it("starts a fresh manual baseline after removing one XML and importing another", async () => {
  mocks.importXml
    .mockResolvedValueOnce({
      initialValues: {
        description: "XML one",
        subtotal: 100,
        cfdi_uuid: "uuid-one",
      },
      uploaded: { path: "one.xml" },
    })
    .mockResolvedValueOnce({
      initialValues: {
        description: "XML two",
        subtotal: 200,
        cfdi_uuid: "uuid-two",
      },
      uploaded: { path: "two.xml" },
    });
  render(<SupplierBillFormDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Importar QA" }));
  await waitFor(() => expect(values().cfdi_uuid).toBe("uuid-one"));
  fireEvent.click(screen.getByRole("button", { name: "Quitar XML" }));
  fireEvent.change(screen.getByLabelText("Manual description"), {
    target: { value: "Between imports" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Importar QA" }));
  await waitFor(() => expect(values().cfdi_uuid).toBe("uuid-two"));
  fireEvent.click(screen.getByRole("button", { name: "Quitar XML" }));
  expect(values()).toMatchObject({
    description: "Between imports",
    subtotal: 40,
    cfdi_uuid: "",
  });
});
