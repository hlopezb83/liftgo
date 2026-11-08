import { resolveVatRatePercent } from "../_shared/money.ts";

export function fiscalSnapshot(value: unknown) {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    tax_rate: resolveVatRatePercent(
      typeof row.tax_rate === "number" || typeof row.tax_rate === "string"
        ? row.tax_rate
        : null,
    ),
    rfc: row.rfc ?? null,
    razon_social: row.razon_social ?? null,
    regimen_fiscal: row.regimen_fiscal ?? null,
    domicilio_fiscal_cp: row.domicilio_fiscal_cp ?? null,
    uso_cfdi: row.uso_cfdi ?? null,
  };
}

/** Hash server-owned commercial data. No customer fiscal data is exposed. */
export async function previewFingerprint(snapshot: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
