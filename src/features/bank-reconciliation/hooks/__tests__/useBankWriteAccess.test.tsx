import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useBankWriteAccess } from "../useBankWriteAccess";

const permission = vi.hoisted(() => ({ role: undefined as string | undefined, full: false }));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: permission.role }),
  useHasModuleAccess: (module: string, access: string) => module === "Conciliación Bancaria" && access === "full" && permission.full,
}));

it.each([
  ["admin", true, true], ["administrativo", true, true], ["ventas", true, false],
  ["admin", false, false], ["administrativo", false, false], [undefined, true, false],
])("keeps the existing RPC role boundary (%s, full=%s)", (role, full, allowed) => {
  permission.role = role; permission.full = full;
  expect(renderHook(() => useBankWriteAccess()).result.current).toBe(allowed);
});
