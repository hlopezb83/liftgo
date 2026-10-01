import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistedCacheKey } from "@/lib/query/persister";

const state = vi.hoisted(() => ({ user: { id: "actor-a" } as { id: string } | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state }));
vi.mock("@/lib/auth/sessionExpiry", () => ({ handleSessionExpired: async () => false }));
import { PlatformSessionProvider } from "../components/PlatformSessionProvider";

describe("caché de plataforma por actor", () => {
  beforeEach(() => { state.user = { id: "actor-a" }; localStorage.clear(); });

  it("el cambio de actor retira caché, borradores y respuestas tardías; no persiste datos", async () => {
    const organizationClient = new QueryClient();
    organizationClient.setQueryData(["customers", "org-a"], ["Cliente privado"]);
    organizationClient.setQueryData(["organization-context", "actor-a"], { organizationId: "org-a" });
    const clients: QueryClient[] = [];
    let finishA: (value: string) => void = () => {};
    const lateA = new Promise<string>((resolve) => { finishA = resolve; });
    function Probe() {
      const client = useQueryClient();
      if (!clients.includes(client)) clients.push(client);
      const [draft, setDraft] = useState("");
      const query = useQuery({ queryKey: ["platform", "organizations"], queryFn: () => state.user?.id === "actor-a" ? lateA : Promise.resolve("Empresa B") });
      return <><input aria-label="Borrador" value={draft} onChange={(e) => setDraft(e.target.value)} /><p>{query.data ?? "Cargando"}</p></>;
    }
    localStorage.setItem(persistedCacheKey("actor-a:org-a:internal"), "dato empresarial");
    const tree = () => <QueryClientProvider client={organizationClient}><PlatformSessionProvider><Probe /></PlatformSessionProvider></QueryClientProvider>;
    const view = render(tree());
    fireEvent.change(screen.getByLabelText("Borrador"), { target: { value: "Dato A" } });
    expect(localStorage.length).toBe(0);
    expect(organizationClient.getQueryCache().getAll()).toHaveLength(0);
    state.user = { id: "actor-b" };
    view.rerender(tree());
    await screen.findByText("Empresa B");
    expect(screen.getByLabelText("Borrador")).toHaveValue("");
    await act(async () => { finishA("Dato confidencial A"); await lateA; });
    expect(screen.queryByText("Dato confidencial A")).not.toBeInTheDocument();
    expect(clients).toHaveLength(2);
    expect(clients[0].getQueryCache().getAll()).toHaveLength(0);
    expect(localStorage.length).toBe(0);
    state.user = null;
    view.rerender(tree());
    await waitFor(() => expect(clients[1].getQueryCache().getAll()).toHaveLength(0));
    view.unmount();
    expect(clients[2].getQueryCache().getAll()).toHaveLength(0);
  });
});
