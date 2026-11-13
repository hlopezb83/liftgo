import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";
import { DocumentAttachments } from "../DocumentAttachments";

const state = vi.hoisted(() => ({ response: { data: [], error: null } as SupabaseMockResponse, sign: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  ...createSupabaseChainMock({ fromResolver: () => state.response }),
  storage: { from: () => ({ createSignedUrls: state.sign }) },
} }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));

const path = "org/supplier/s-1/document.pdf";
const url = `https://storage.example.invalid/storage/v1/object/sign/documents/${path}?token=fixture`;
const document = { id: "doc-1", file_url: `documents/${path}`, file_name: "Documento QA.pdf", mime_type: "application/pdf", file_size: 100 };
const component = <DocumentAttachments entityType="supplier" entityId="s-1" accessModule="Proveedores" />;
afterEach(cleanup);
beforeEach(() => {
  state.response = { data: [document], error: null };
  state.sign.mockReset().mockResolvedValue({ data: [{ path, signedUrl: url, error: null }], error: null });
});

describe("attachments query availability", () => {
  it("shows read failure with retry and displays a confirmed empty list only after recovery", async () => {
    state.response = { data: null, error: { message: "Consulta no disponible" } };
    render(component, { wrapper: createQueryWrapper().Wrapper });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando adjuntos");
    expect(await screen.findByText("No se pudo cargar los adjuntos")).toBeInTheDocument();
    expect(screen.queryByText("Sin adjuntos")).not.toBeInTheDocument();
    state.response = { data: [], error: null };
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Sin adjuntos")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar los adjuntos")).not.toBeInTheDocument();
  });

  it.each(["batch", "partial"])("retries a %s signing failure without publishing internal links", async failure => {
    state.sign.mockResolvedValue(failure === "batch"
      ? { data: null, error: new Error("Firma no disponible") }
      : { data: [], error: null });
    render(component, { wrapper: createQueryWrapper().Wrapper });
    expect(await screen.findByText("No se pudo cargar los adjuntos")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin adjuntos")).not.toBeInTheDocument();
    state.sign.mockResolvedValue({ data: [{ path, signedUrl: url, error: null }], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: /Documento QA.pdf/ })).toHaveAttribute("href", url);
    expect(state.sign).toHaveBeenCalledTimes(2);
  });

  it("hides cached links when a background reload fails", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    render(component, { wrapper: Wrapper });
    expect(await screen.findByRole("link", { name: /Documento QA.pdf/ })).toHaveAttribute("href", url);
    state.response = { data: null, error: { message: "Recarga no disponible" } };
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText("No se pudo cargar los adjuntos")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin adjuntos")).not.toBeInTheDocument();
  });
});
