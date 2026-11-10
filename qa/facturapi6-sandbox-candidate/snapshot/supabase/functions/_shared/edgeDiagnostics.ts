/** Datos confirmados por los guards; no incluir payload, email ni credenciales. */
export type VerifiedEdgeIdentity = {
  userId?: string;
  organizationId?: string;
  role?: string;
};

/** Puerto de diagnóstico: el handler no importa el SDK ni controla su transporte. */
export interface EdgeDiagnostics {
  identify(identity: VerifiedEdgeIdentity): void;
  capture(error: unknown, status?: number): void;
}

function safely(work: () => void): void {
  try {
    work();
  } catch { /* Un fallo de diagnóstico no modifica el negocio. */ }
}

/** Estado local a una invocación: conserva actor/rol al resolver su empresa. */
export function createRequestDiagnostics(port?: EdgeDiagnostics) {
  let identity: VerifiedEdgeIdentity = {};
  return {
    authenticated(verified: VerifiedEdgeIdentity) {
      identity = { ...verified };
      safely(() => port?.identify({ ...identity }));
    },
    organization(organizationId: string) {
      identity = { ...identity, organizationId };
      safely(() => port?.identify({ ...identity }));
    },
    capture(error: unknown, status?: number) {
      safely(() => port?.capture(error, status));
    },
  };
}
