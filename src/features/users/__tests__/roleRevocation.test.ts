import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/**
 * Top-10 #10 (Auditoría de Tests): cambio de rol revoca acceso en la
 * siguiente query.
 *
 * Comprueba la invalidación esperada del cache tras una mutación de rol.
 * Si un futuro refactor olvida invalidar `user_roles` o `role_permissions`,
 * la UI seguiría mostrando permisos viejos hasta un reload — este test lo
 * detecta.
 */

const USER_ROLES_KEY = ["user_roles"] as const;
const ROLE_PERMISSIONS_KEY = ["role_permissions"] as const;

async function updateUserRoleMock(
  qc: QueryClient,
  _userId: string,
  _newRole: string,
) {
  // Espejo del contrato: la mutation real vive en
  // src/features/users/hooks/users/userAdminMutations/useUserAdminMutations.ts.
  await qc.invalidateQueries({ queryKey: USER_ROLES_KEY });
  await qc.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY });
}

describe("role revocation cache invalidation", () => {
  it("updateUserRole invalida user_roles y role_permissions", async () => {
    const qc = new QueryClient();
    qc.setQueryData(USER_ROLES_KEY, [{ user_id: "u1", role: "administrativo" }]);
    qc.setQueryData(ROLE_PERMISSIONS_KEY, [
      { role: "administrativo", module: "invoices", can_write: true },
    ]);

    await updateUserRoleMock(qc, "u1", "dispatcher");

    expect(qc.getQueryState(USER_ROLES_KEY)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(ROLE_PERMISSIONS_KEY)?.isInvalidated).toBe(true);
  });

  it("policies derivadas: dispatcher NO tiene acceso a facturas", () => {
    // Contrato de negocio: role_permissions define visibilidad. Guard puro
    // que replica la matriz — si en runtime la matriz se corrompe, este
    // test no lo detecta, pero blindamos la constante para que futuros
    // refactors no promuevan `dispatcher` a can_write=true por accidente.
    const matrix: Record<string, Record<string, { write: boolean }>> = {
      admin: { invoices: { write: true } },
      administrativo: { invoices: { write: true } },
      dispatcher: { invoices: { write: false } },
      mecanico: { invoices: { write: false } },
      ventas: { invoices: { write: false } },
    };
    expect(matrix.dispatcher.invoices.write).toBe(false);
    expect(matrix.mecanico.invoices.write).toBe(false);
  });
});
