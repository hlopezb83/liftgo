import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fase 3 — la plantilla efectiva se resuelve en DB desde la organización de
 * la sesión. El cliente sólo declara el tipo documental, nunca organization_id.
 */
const state: { rows: unknown[]; error: unknown } = { rows: [], error: null };
const calls: Array<[string, unknown]> = [];

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: vi.fn((name: string, args: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ data: state.rows, error: state.error });
      }),
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      },
    },
  };
});

const { fetchDefaultContractTemplate } = await import(
  "@/features/contracts/hooks/useContractTemplates"
);

const row = (id: string) => ({
  version_id: id,
  definition_id: `def-${id}`,
  template_key: "rental_contract",
  template_name: "Plantilla",
  document_type: "rental_contract",
  version: 1,
  checksum_sha256: "a".repeat(64),
  local_overrides: {},
  content: {
    body_text: "",
    intro_text: null,
    declarations_landlord: [],
    declarations_tenant: [],
    clauses: [],
    checklist_sections: [],
    pagare_text: null,
  },
});

describe("fetchDefaultContractTemplate", () => {
  beforeEach(() => {
    calls.length = 0;
    state.rows = [];
    state.error = null;
  });

  it("pide la versión efectiva sin enviar organization_id", async () => {
    state.rows = [row("t-a")];
    const tpl = await fetchDefaultContractTemplate("org-a");
    expect(tpl?.id).toBe("t-a");
    expect(calls).toEqual([["get_effective_legal_template", { p_document_type: "rental_contract" }]]);
  });

  it("ausencia: sin plantilla de la empresa devuelve null (sin respaldo ajeno)", async () => {
    state.rows = [];
    await expect(fetchDefaultContractTemplate("org-b")).resolves.toBeNull();
    expect(calls[0]?.[1]).not.toHaveProperty("organization_id");
  });

  it("ambigüedad: dos predeterminadas lanzan error explícito", async () => {
    state.rows = [row("t1"), row("t2")];
    await expect(fetchDefaultContractTemplate("org-a")).rejects.toThrow(/más de una plantilla/i);
  });

  it("error de lectura no se confunde con ausencia", async () => {
    state.error = { message: "permission denied" };
    await expect(fetchDefaultContractTemplate("org-a")).rejects.toThrow(/No pudimos leer/i);
  });
});
