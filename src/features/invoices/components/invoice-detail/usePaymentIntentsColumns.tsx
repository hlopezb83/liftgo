import { useMemo } from "react";
import type { ColumnDef } from "@/components/dataTable/v2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useAdminPaymentIntents } from "@/features/portal";
import { PAYMENT_INTENT_STATUS as STATUS_LABEL } from "@/lib/domain/paymentIntentStatus";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";

export type PaymentIntent = NonNullable<
  ReturnType<typeof useAdminPaymentIntents>["data"]
>[number];

interface Options {
  onOpenProof: (path: string) => void;
  onApprove: (intentId: string) => void;
  onReject: (intentId: string) => void;
}

export function usePaymentIntentsColumns({
  onOpenProof,
  onApprove,
  onReject,
}: Options): ColumnDef<PaymentIntent>[] {
  return useMemo(
    () => [
      {
        id: "transfer_date",
        header: "Fecha",
        accessorKey: "transfer_date",
        cell: ({ row }) => formatDateDisplay(row.original.transfer_date),
      },
      {
        id: "amount",
        header: "Monto",
        accessorKey: "amount",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-mono">{formatCurrency(Number(row.original.amount))}</span>
        ),
      },
      {
        id: "bank",
        header: "Banco",
        enableSorting: false,
        cell: ({ row }) =>
          `${row.original.sender_bank ?? "—"}${
            row.original.sender_last4 ? ` ····${row.original.sender_last4}` : ""
          }`,
      },
      {
        id: "tracking_key",
        header: "Rastreo",
        accessorKey: "tracking_key",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.tracking_key ?? "—"}</span>
        ),
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => {
          const meta = STATUS_LABEL[row.original.status] ?? {
            label: row.original.status,
            variant: "outline" as const,
          };
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row }) => {
          const intent = row.original;
          const pending = intent.status === "pending_review";
          return (
            <div className="flex justify-end gap-2">
              {intent.proof_url && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenProof(intent.proof_url ?? "")}
                >
                  Comprobante
                </Button>
              )}
              {pending && (
                <>
                  <Button size="sm" onClick={() => onApprove(intent.id)}>
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onReject(intent.id)}
                  >
                    Rechazar
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [onOpenProof, onApprove, onReject],
  );
}
