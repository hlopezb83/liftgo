/**
 * Query keys y tipos puros para `customer_payment_intents`.
 *
 * Las query definitions con I/O viven en `./paymentIntentsQueries`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import type { PaymentIntentStatus } from "./paymentIntentStatus";

export interface PortalPaymentIntentRow {
  id: string;
  invoice_id: string;
  customer_id: string;
  amount: number;
  transfer_date: string;
  tracking_key: string | null;
  status: PaymentIntentStatus;
  review_notes: string | null;
}

export interface AdminPaymentIntentRow extends PortalPaymentIntentRow {
  sender_bank: string | null;
  sender_last4: string | null;
  proof_url: string | null;
  review_notes: string | null;
}

export const paymentIntentsKeys = createEntityKeys("portal_payment_intents");
export const adminPaymentIntentsKeys = createEntityKeys("admin_payment_intents");
