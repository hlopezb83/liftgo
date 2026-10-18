import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureOperationalError } from "./captureOperationalError";

const sdk = vi.hoisted(() => ({ getClient: vi.fn(), withScope: vi.fn(), captureException: vi.fn(), setTag: vi.fn(), setContext: vi.fn() }));
vi.mock("./sentry", () => ({ Sentry: sdk }));
beforeEach(() => {
  vi.resetAllMocks();
  sdk.getClient.mockReturnValue({});
  sdk.withScope.mockImplementation((callback) => callback({ setTag: sdk.setTag, setContext: sdk.setContext }));
});

describe("clasificación conservadora de permisos operativos", () => {
  it.each(["table supplier_bills", "column discount of relation supplier_bills", "function recalc_supplier_bill"])("captura un 403 PostgreSQL de privilegios sobre %s", (resource) => {
    captureOperationalError({ status: 403, code: "42501", message: `permission denied for ${resource}` }, { errorCode: "DB_PERMISSION_DENIED" });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    expect(sdk.setContext).toHaveBeenCalledWith("operation", { status: 403, code: "42501" });
  });

  it.each([
    { status: 403, code: "42501", message: 'new row violates row-level security policy for table "supplier_bills"' },
    { status: 403, message: "Forbidden: role mechanic cannot update suppliers" },
    { status: 403, code: "42501", message: "permission denied" },
    { status: 403, message: "permission denied for table supplier_bills" },
    { status: 401, code: "42501", message: "permission denied for table supplier_bills" },
  ])("omite autorización esperada o sin evidencia estructurada: $message ($status)", (error) => {
    captureOperationalError(error, { errorCode: "DB_PERMISSION_DENIED" });
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("captura privilegios técnicos sin status y no copia datos del proveedor", () => {
    const error = { code: "42501", message: "permission denied for table supplier_bills password=private-secret audit@example.com",
      details: "private-business-row", hint: "token=opaque", body: { customer: "private-customer" } };
    captureOperationalError(error, { phase: "mutation", errorCode: "DB_PERMISSION_DENIED" });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    const incident = sdk.captureException.mock.calls[0][0] as Error;
    expect(incident.message).toBe("Database privilege denied for table");
    const serialized = JSON.stringify({ message: incident.message, stack: incident.stack, context: sdk.setContext.mock.calls });
    for (const secret of ["private-secret", "audit@example.com", "opaque", "private-business-row", "private-customer"]) expect(serialized).not.toContain(secret);
  });
});
