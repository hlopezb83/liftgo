import { dehydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IdentityScopedPersistence } from "../IdentityScopedPersistence";
import { shouldPersistQuery } from "../persister";
import type { OrganizationContextState } from "@/contexts/OrganizationContext";

const identity = vi.hoisted(() => ({ userId: "user-a", organization: { status: "loading" } as OrganizationContextState }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: identity.userId }, isLoading: false }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => identity.organization }));

it("reutiliza los chequeos al verificar empresa y los retira al cambiar de cuenta", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const roleKey = ["user_role", "user-a"];
  const operatorKey = ["platform", "operator", "user-a"];
  const queryFn = vi.fn(async () => "auditor");
  await client.fetchQuery({ queryKey: roleKey, queryFn, staleTime: Infinity });
  client.setQueryData(operatorKey, false);

  const tree = () => (
    <QueryClientProvider client={client}>
      <IdentityScopedPersistence><p>Contenido protegido</p></IdentityScopedPersistence>
    </QueryClientProvider>
  );
  const { rerender } = render(tree());
  identity.organization = { status: "ready", organizationId: "org-a", memberType: "internal", customerId: null };
  rerender(tree());
  await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());
  await client.fetchQuery({ queryKey: roleKey, queryFn, staleTime: Infinity });
  expect(queryFn).toHaveBeenCalledOnce();
  expect(client.getQueryData(operatorKey)).toBe(false);
  expect(dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }).queries).toEqual([]);

  identity.userId = "user-b";
  identity.organization = { status: "ready", organizationId: "org-b", memberType: "internal", customerId: null };
  rerender(tree());
  await waitFor(() => expect(client.getQueryState(roleKey)).toBeUndefined());
  expect(client.getQueryState(operatorKey)).toBeUndefined();
});
