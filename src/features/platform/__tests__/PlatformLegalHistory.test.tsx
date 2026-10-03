import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.types";
const history = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platformLegalTemplates.functions", () => ({ listPlatformLegalTemplateVersionsFn: history }));
import { PlatformLegalTemplateHistoryDialog } from "../components/legalTemplates/PlatformLegalTemplateHistoryDialog";
const content = { intro_text: "Contrato {{folio}}", declarations_landlord: [], declarations_tenant: [],
  clauses: [{ title: "Pago", body: "Pago anticipado" }], checklist_sections: [], pagare_text: null };
const template: PlatformLegalTemplateRow = { id: "definition", template_key: "rental_contract", document_type: "rental_contract",
  name: "Contrato de renta", description: null, is_active: true, current_version_id: "v2", current_version: 2,
  checksum_sha256: "hash", content, change_summary: "Revisión", version_count: 2, assignment_count: 2, active_organization_count: 2,
  updated_at: "2026-10-03T10:00:00Z" };
describe("historial legal de lectura", () => {
  it("consulta autor y diferencias sin acciones de escritura o adopción", async () => {
    history.mockResolvedValue([
      { id: "v2", definition_id: template.id, version: 2, content, checksum_sha256: "hash2", change_summary: "Pago revisado",
        created_by: "operator", created_by_name: "Mariana Garza", created_at: template.updated_at },
      { id: "v1", definition_id: template.id, version: 1, content: { ...content, clauses: [{ title: "Pago", body: "Pago mensual" }] },
        checksum_sha256: "hash1", change_summary: "Inicial", created_by: null, created_by_name: null, created_at: "2026-10-02T10:00:00Z" },
    ]);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const close = vi.fn();
    render(<QueryClientProvider client={cache}><PlatformLegalTemplateHistoryDialog template={template} onClose={close} /></QueryClientProvider>);
    await screen.findByText("Pago revisado");
    expect(screen.getByText(/Mariana Garza/)).toBeInTheDocument();
    expect(screen.getByText("Contrato {{folio}}")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar versión" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Cambios" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Versión 1 → versión 2")).toBeInTheDocument();
    expect(screen.getByText(/Pago mensual/)).toBeInTheDocument();
    expect(screen.getByText(/Pago anticipado/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Versión a consultar"), { target: { value: "v1" } });
    expect(screen.getByText(/Es la primera versión/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cerrar", { selector: "button" })); expect(close).toHaveBeenCalledOnce(); cache.clear();
  });
});
