import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { TestRouter } from "@/test/router";
import { REP_MAX_FILE_BYTES } from "@/lib/supplierRepXml";
import { UploadSupplierRepDialog } from "../UploadSupplierRepDialog";

const { validate, success, warning } = vi.hoisted(() => ({
  validate: vi.fn(), success: vi.fn(), warning: vi.fn(),
}));

vi.mock("@/lib/supplierRep.functions", () => ({ validateSupplierRepFn: validate }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: success, notifyWarning: warning, notifyError: vi.fn() }));
vi.mock("../../hooks/useSupplierBills", () => ({
  supplierBillKeys: { all: ["bills"], detail: (id: string) => ["bills", id] },
}));

beforeEach(() => vi.clearAllMocks());

async function setup() {
  const { Wrapper } = createQueryWrapper();
  const close = vi.fn();
  render(<Wrapper><TestRouter>
    <UploadSupplierRepDialog open onOpenChange={close} paymentId="payment-a" billId="bill-a" paymentAmountLabel="$100" />
  </TestRouter></Wrapper>);
  return {
    close,
    xml: await screen.findByLabelText(/XML del REP/),
    pdf: screen.getByLabelText(/PDF del REP/),
    submit: screen.getByRole("button", { name: "Cargar y validar" }),
  };
}

function select(input: HTMLElement, filename: string, bytes: number) {
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(bytes)], filename)] } });
}

it.each(["xml", "pdf"] as const)("valida el tamaño del %s al seleccionar y acepta el límite exacto", async (kind) => {
  const form = await setup();
  expect(form[kind]).toHaveAccessibleDescription("Máximo 5 MB.");
  select(form.xml, "rep.xml", 16);
  select(form[kind], "rep." + kind, REP_MAX_FILE_BYTES + 1);
  expect(await screen.findByText("El archivo supera el límite de 5 MB.")).toBeVisible();
  expect(form[kind]).toHaveAttribute("aria-invalid", "true");
  expect(form.submit).toBeDisabled();
  expect(validate).not.toHaveBeenCalled();

  select(form[kind], "rep." + kind, REP_MAX_FILE_BYTES);
  await waitFor(() => expect(form.submit).toBeEnabled());
  expect(screen.queryByText("El archivo supera el límite de 5 MB.")).not.toBeInTheDocument();
});

it.each([
  { pdfSelected: true, pdfUrl: null, partial: true },
  { pdfSelected: true, pdfUrl: "rep.pdf", partial: false },
  { pdfSelected: false, pdfUrl: null, partial: false },
])("comunica el resultado del REP con PDF seleccionado=$pdfSelected y URL=$pdfUrl", async ({ pdfSelected, pdfUrl, partial }) => {
  validate.mockResolvedValueOnce({ xml_url: "rep.xml", pdf_url: pdfUrl });
  const { close, xml, pdf, submit } = await setup();
  select(xml, "rep.xml", 16);
  if (pdfSelected) select(pdf, "rep.pdf", 16);
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith(false));
  expect(validate).toHaveBeenCalledOnce();
  if (partial) {
    expect(warning).toHaveBeenCalledExactlyOnceWith("XML del REP validado", { description: "No se pudo guardar el PDF adjunto." });
    expect(success).not.toHaveBeenCalled();
  } else {
    expect(success).toHaveBeenCalledExactlyOnceWith("REP recibido y validado",
      pdfSelected ? { description: "El PDF adjunto quedó guardado." } : undefined);
    expect(warning).not.toHaveBeenCalled();
  }
});
