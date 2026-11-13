import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ duplicate: vi.fn(), upload: vi.fn(), remove: vi.fn(), organization: vi.fn(), notifyError: vi.fn(), notifyWarning: vi.fn() }));
vi.mock("@/features/company-settings", () => ({ useCompanySettings: () => ({ data: { rfc: "AAA010101AAA" } }) }));
vi.mock("@/features/suppliers", () => ({ useSuppliers: () => ({ data: [{ id: "supplier-a", rfc: "AAA010101AAA" }] }) }));
vi.mock("../useCheckSupplierBillCfdiUuid", () => ({ checkSupplierBillCfdiUuid: mocks.duplicate }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.organization, storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: mocks.notifyError, notifyWarning: mocks.notifyWarning }));
import { useImportSupplierBillCfdi } from "../useImportSupplierBillCfdi";

const organization = "10000000-0000-4000-8000-000000000001";
const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Moneda="MXN" SubTotal="100" Total="100" Fecha="2026-11-13T10:00:00" TipoDeComprobante="I"><cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Receptor Rfc="AAA010101AAA"/><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="20000000-0000-4000-8000-000000000001"/></cfdi:Complemento></cfdi:Comprobante>`;
function file() { const f = new File([xml], "invoice.xml"); Object.defineProperty(f, "text", { value: async () => xml }); return f; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useImportSupplierBillCfdi(), { wrapper });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.duplicate.mockResolvedValue(null);
  mocks.organization.mockResolvedValue({ data: organization, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
});

it("does not start a storage upload after unmount during validation", async () => {
  const check = deferred<null>(); mocks.duplicate.mockReturnValueOnce(check.promise);
  const { result, unmount } = mount();
  let importing!: ReturnType<typeof result.current.importXml>;
  act(() => { importing = result.current.importXml(file()); });
  await waitFor(() => expect(mocks.duplicate).toHaveBeenCalledOnce());
  unmount(); check.resolve(null);
  expect(await importing).toBeNull();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("cleans only the obsolete upload and leaves a replacement operation busy", async () => {
  const oldUpload = deferred<{ error: null }>(); mocks.upload.mockReturnValueOnce(oldUpload.promise);
  const newCheck = deferred<null>();
  const { result } = mount();
  let old!: ReturnType<typeof result.current.importXml>;
  act(() => { old = result.current.importXml(file()); });
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
  const oldPath = mocks.upload.mock.calls[0][0];
  act(() => result.current.reset());
  mocks.duplicate.mockReturnValueOnce(newCheck.promise);
  let replacement!: typeof old;
  act(() => { replacement = result.current.importXml(file()); });
  await act(async () => { oldUpload.resolve({ error: null }); expect(await old).toBeNull(); });
  expect(result.current.busy).toBe(true);
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([oldPath]);
  await act(async () => { newCheck.resolve(null); await replacement; });
  expect(result.current.result?.initialValues.supplier_id).toBe("supplier-a");
  expect(mocks.upload.mock.calls[1][0]).not.toBe(oldPath);
  expect(mocks.remove).toHaveBeenCalledTimes(1);
  expect(mocks.notifyError).not.toHaveBeenCalled();
});

it("does not upload when the capture changes while resolving the organization", async () => {
  const lookup = deferred<{ data: string; error: null }>(); mocks.organization.mockReturnValueOnce(lookup.promise);
  const { result, unmount } = mount();
  let importing!: ReturnType<typeof result.current.importXml>;
  act(() => { importing = result.current.importXml(file()); });
  await waitFor(() => expect(mocks.organization).toHaveBeenCalledOnce());
  unmount(); lookup.resolve({ data: organization, error: null });
  expect(await importing).toBeNull();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.notifyError).not.toHaveBeenCalled();
});

it("keeps accepted XML and permits retry after an actual upload failure", async () => {
  mocks.upload.mockResolvedValueOnce({ error: new Error("Storage unavailable") });
  const { result } = mount();
  await act(async () => { expect(await result.current.importXml(file())).toBeNull(); });
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBe("Storage unavailable");
  await act(async () => { expect(await result.current.importXml(file())).not.toBeNull(); });
  expect(result.current.error).toBeNull();
  expect(mocks.remove).not.toHaveBeenCalled();
});
