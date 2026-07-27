import { STATUS_LABELS } from "@/lib/constants";

/**
 * R17-Q: en contratos, `sent` es "Enviado" (no "Sin Pagar", que es el label
 * global usado por facturas). `signed` se refuerza como "Firmado".
 */
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  sent: "Enviado",
  signed: "Firmado",
};
