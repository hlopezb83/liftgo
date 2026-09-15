import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Subtramo 6.1 — la plantilla predeterminada se lee dentro de la organización
 * verificada. Fixture A/B: con la organización A nunca se consulta sin filtro
 * y una segunda plantilla predeterminada produce ambigüedad, no la primera.
 */
const state: { rows: unknown[]; error: unknown } = { rows: [], error: null };
const calls: Array<[string, unknown]> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  ["select", "eq", "order", "limit", "returns"].forEach((k) => {
    chain[k] = vi.fn((a?: unknown, b?: unknown) => {
      if (k === "eq") calls.push([String(a), b]);
      return k === "returns" ? Promise.resolve({ data: state.rows, error: state.error }) : chain;
    });
  });
  return {
    supabase: {
      from: vi.fn(() => chain),
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
  id,
  name: "Plantilla",
  body_text: "",
  is_default: true,
  intro_text: null,
  declarations_landlord: [],
  declarations_tenant: [],
  clauses: [],
  checklist_sections: [],
  pagare_text: null,
  updated_at: null,
});

describe("fetchDefaultContractTemplate", () => {
  beforeEach(() => {
    calls.length = 0;
    state.rows = [];
    state.error = null;
  });

  it("filtra por la organización verificada y por is_default", async () => {
    state.rows = [row("t-a")];
    const tpl = await fetchDefaultContractTemplate("org-a");
    expect(tpl?.id).toBe("t-a");
    expect(calls).toContainEqual(["organization_id", "org-a"]);
    expect(calls).toContainEqual(["is_default", true]);
  });

  it("ausencia: sin plantilla de la empresa devuelve null (sin respaldo ajeno)", async () => {
    state.rows = [];
    await expect(fetchDefaultContractTemplate("org-b")).resolves.toBeNull();
    expect(calls).toContainEqual(["organization_id", "org-b"]);
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
