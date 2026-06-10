import { describe, it, expect } from "vitest";
import { getAccessLevel, type PermissionsMap } from "@/features/users/hooks/useRolePermissions";
import type { AppRole } from "@/features/users/hooks/useUserRole";

/**
 * Lote 11 — Matriz de roles vs módulos (regresión de la reorganización v6.37.0).
 *
 * Valida que getAccessLevel respeta los seeds esperados de role_permissions:
 *  - admin: full en todos los módulos críticos
 *  - mechanic: sin acceso a facturas, contratos, clientes, reservas
 *  - customer: sin acceso a módulos internos
 *  - auditor: read en finanzas
 *  - módulos que no existen en el mapa → "none" (fail-closed)
 */

const PERMS: PermissionsMap = {
  admin: {
    Dashboard: "full", Flota: "full", Reservas: "full", Facturas: "full",
    Contratos: "full", Clientes: "full", Mantenimiento: "full",
    "Cuentas Bancarias": "full", "Flujo de Caja": "full",
    "Conciliación Bancaria": "full", MRR: "full",
    "Gestión de Usuarios": "full", Configuración: "full",
  },
  administrativo: {
    Dashboard: "full", Facturas: "full", "Cuentas Bancarias": "full",
    "Flujo de Caja": "full", "Conciliación Bancaria": "full", MRR: "read",
  },
  auditor: {
    Dashboard: "read", Facturas: "read", "Cuentas Bancarias": "read",
    "Flujo de Caja": "read", "Conciliación Bancaria": "read", MRR: "read",
  },
  ventas: {
    Dashboard: "full", Cotizaciones: "full", Clientes: "full",
    Facturas: "read", MRR: "read",
  },
  dispatcher: {
    Dashboard: "read", Flota: "full", Reservas: "full",
    Entregas: "full", Mantenimiento: "read",
  },
  mechanic: {
    Dashboard: "read", Flota: "read", Mantenimiento: "full", Daños: "full",
  },
  customer: {
    // El cliente del portal no tiene entradas en role_permissions (RPCs separadas)
  },
};

describe("Matriz de roles vs módulos — getAccessLevel", () => {
  const expectMatrix: Array<[AppRole, string, "full" | "read" | "none"]> = [
    // admin = full
    ["admin", "Facturas", "full"],
    ["admin", "Cuentas Bancarias", "full"],
    ["admin", "MRR", "full"],
    ["admin", "Gestión de Usuarios", "full"],
    // administrativo = full en finanzas, read en MRR
    ["administrativo", "Cuentas Bancarias", "full"],
    ["administrativo", "MRR", "read"],
    // auditor = solo lectura en finanzas
    ["auditor", "Cuentas Bancarias", "read"],
    ["auditor", "Flujo de Caja", "read"],
    ["auditor", "Facturas", "read"],
    // ventas = sin acceso a bancarias
    ["ventas", "Cuentas Bancarias", "none"],
    ["ventas", "Cotizaciones", "full"],
    // dispatcher = ops, sin finanzas
    ["dispatcher", "Cuentas Bancarias", "none"],
    ["dispatcher", "Reservas", "full"],
    // mechanic = sin acceso a finanzas ni clientes
    ["mechanic", "Facturas", "none"],
    ["mechanic", "Clientes", "none"],
    ["mechanic", "Cuentas Bancarias", "none"],
    ["mechanic", "Mantenimiento", "full"],
    // customer = sin acceso a nada interno (fail-closed)
    ["customer", "Facturas", "none"],
    ["customer", "Flota", "none"],
    ["customer", "Cuentas Bancarias", "none"],
  ];

  for (const [role, module, expected] of expectMatrix) {
    it(`${role} × ${module} → ${expected}`, () => {
      expect(getAccessLevel(PERMS, role, module)).toBe(expected);
    });
  }

  it("fail-closed: módulo desconocido → none", () => {
    expect(getAccessLevel(PERMS, "admin", "ModuloInexistente")).toBe("none");
  });

  it("fail-closed: sin perms cargado → none", () => {
    expect(getAccessLevel(undefined, "admin", "Facturas")).toBe("none");
  });

  it("fail-closed: sin rol → none", () => {
    expect(getAccessLevel(PERMS, undefined, "Facturas")).toBe("none");
  });
});
