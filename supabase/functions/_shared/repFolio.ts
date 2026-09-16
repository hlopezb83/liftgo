// Multiempresa · Tramo 8.1: asignación del folio REP en un único lugar.
//
// Reglas que este módulo hace cumplir del lado del código:
//  - La organización SIEMPRE viene del contexto verificado en servidor (la
//    organización del pago / del documento), nunca del navegador. Se envía a la
//    RPC solo para que la base la contraste y rechace cruces.
//  - Un REP ya timbrado en el PAC NUNCA puede terminar en éxito con folio
//    nulo: quien llama debe propagar un error recuperable y dejar el pago con
//    un mensaje explícito para recuperación idempotente.
import type { SupabaseLike } from "./types.ts";

export type RepFolioFailure =
  | "missing_folio"
  | "cross_organization"
  | "collision"
  | "failed";

export type RepFolioResult =
  | {
    ok: true;
    repNumber: string;
    alreadyAssigned: boolean;
    /** true si se usó la firma histórica de dos parámetros (migración 0026 aún no aplicada). */
    usedLegacySignature?: boolean;
  }
  | { ok: false; code: RepFolioFailure; message: string };

/** Mensaje persistido en `payments.rep_error_message` cuando falta el folio. */
export function repFolioPendingMessage(detail: string): string {
  return (
    "REP timbrado ante el SAT, pero no se pudo asignar el folio interno: " +
    `${detail} El pago conserva su CFDI; el folio se asigna automáticamente ` +
    "en la siguiente reconciliación o al reintentar la asignación (no se " +
    "vuelve a timbrar)."
  ).slice(0, 1000);
}

function classify(message: string): RepFolioFailure {
  const m = message.toLowerCase();
  if (m.includes("another organization") || m.includes("no organization")) {
    return "cross_organization";
  }
  if (m.includes("already assigned") || m.includes("duplicate key")) {
    return "collision";
  }
  return "failed";
}

/**
 * Detecta que la base todavía no tiene la firma de tres parámetros
 * (migración 0026 no aplicada). PostgREST responde PGRST202 y Postgres 42883.
 */
function signatureMissing(err: { code?: string; message?: string }): boolean {
  const code = err.code ?? "";
  if (code === "PGRST202" || code === "42883") return true;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("could not find the function") ||
    (m.includes("assign_stamped_rep_number") && m.includes("does not exist"))
  );
}

type RpcClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<
    { data: unknown; error: { message?: string; code?: string } | null }
  >;
};

/**
 * Asigna el folio REP de forma idempotente.
 * `organizationId` debe ser la organización verificada del pago.
 */
export async function assignRepFolio(
  admin: SupabaseLike,
  args: {
    paymentId: string;
    organizationId: string | null | undefined;
    folio: string | number | null | undefined;
  },
): Promise<RepFolioResult> {
  const folio = args.folio === null || args.folio === undefined
    ? null
    : String(args.folio).trim();
  if (!folio) {
    return {
      ok: false,
      code: "missing_folio",
      message: "Facturapi no devolvió folio para el complemento de pago.",
    };
  }
  if (!args.organizationId) {
    return {
      ok: false,
      code: "cross_organization",
      message: "El pago no tiene empresa asignada; no se puede folear.",
    };
  }

  const client = admin as unknown as RpcClient;
  let usedLegacySignature = false;
  let res = await client.rpc("assign_stamped_rep_number", {
    p_payment_id: args.paymentId,
    p_folio: folio,
    p_organization_id: args.organizationId,
  });

  // Compatibilidad de rollout: si la migración 0026 aún no está aplicada, la
  // firma de tres parámetros no existe. En ese caso se reintenta con la firma
  // histórica de dos parámetros (que actualiza el propio pago por su id, ya
  // validado contra la organización verificada antes de llegar aquí) en lugar
  // de dejar un REP timbrado sin folio. La organización nunca viaja como dato
  // del navegador en ninguna de las dos rutas.
  if (res.error && signatureMissing(res.error)) {
    usedLegacySignature = true;
    res = await client.rpc("assign_stamped_rep_number", {
      p_payment_id: args.paymentId,
      p_folio: folio,
    });
  }

  if (res.error) {
    const message = res.error.message ?? "error de base de datos";
    return { ok: false, code: classify(message), message };
  }

  const repNumber = typeof res.data === "string" ? res.data : null;
  if (!repNumber) {
    return {
      ok: false,
      code: "failed",
      message: "La asignación de folio no devolvió número de REP.",
    };
  }
  return {
    ok: true,
    repNumber,
    alreadyAssigned: repNumber !== `CP-${folio.padStart(4, "0")}`,
    usedLegacySignature,
  };
}
