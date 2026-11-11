import { useState } from "react";
import { toYMD } from "@/lib/format/dateFormats";
import { roundMoney } from "@/lib/money";
import {
  describeBusinessBlock,
  resolveBusinessBlock,
  type BusinessBlock,
} from "@/lib/rules/businessBlocks";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { satCodeForMethod } from "../../lib/paymentMethods";
import { useCreatePayment } from "../usePayments";
import { useStampPaymentComplement } from "./cfdi/usePaymentComplement";
import { isPaymentFormDirty, type PaymentFormSnapshot } from "./paymentFormDirty";

/** L-7: monto máximo de un pago individual (anti-capturas erróneas). */
const MAX_PAYMENT_AMOUNT = 99_999_999.99;
const INVALID_PAYMENT_DATE_MESSAGE = "Captura una fecha válida para el pago.";

function isValidPaymentDate(date: Date | undefined): date is Date {
  return !!date && Number.isFinite(date.getTime());
}

interface Args {
  open: boolean;
  balance: number;
  ppdStamped: boolean;
  invoiceId: string;
  /** C-1: divisa de la factura. El pago se fuerza a coincidir. Default "MXN". */
  invoiceCurrency?: string | null;
  /** R7 Bloque 14: tipo de cambio de la factura para prellenar el TC del pago. */
  invoiceExchangeRate?: number | null;
  /** N-34: fecha de emisión de la factura (YYYY-MM-DD) para validar payment_date >= issued_at. */
  invoiceIssuedAt?: string | null;
  onOpenChange: (open: boolean) => void;
}

function initialPaymentDraft(balance: number, exchangeRate: string, ppdStamped: boolean): PaymentFormSnapshot {
  return {
    amount: balance.toFixed(2),
    date: nowMty(),
    method: "transfer",
    paymentFormSat: satCodeForMethod("transfer"),
    exchangeRate,
    reference: "",
    notes: "",
    stampRep: ppdStamped,
  };
}

const PAYMENT_CURRENCY_CHANGED = "Cambió la moneda de la factura. Vuelve a abrir el registro de pago para capturar en la moneda actual.";

export function useRecordPaymentForm({ open, balance, ppdStamped, invoiceId, invoiceCurrency, invoiceExchangeRate, invoiceIssuedAt, onOpenChange }: Args) {
  const lockedCurrency = (invoiceCurrency ?? "MXN").toUpperCase();
  const initialRate = lockedCurrency !== "MXN" && invoiceExchangeRate && invoiceExchangeRate > 0
    ? String(invoiceExchangeRate) : "1";
  const [session, setSession] = useState(() => {
    const initial = initialPaymentDraft(balance, initialRate, ppdStamped);
    return { open, invoiceId, currency: lockedCurrency, initial, draft: initial };
  });
  const [serverBlock, setServerBlock] = useState<BusinessBlock | null>(null);
  const createPayment = useCreatePayment();
  const stampComplement = useStampPaymentComplement();

  if (open !== session.open || invoiceId !== session.invoiceId) {
    if (open) {
      const initial = initialPaymentDraft(balance, initialRate, ppdStamped);
      setSession({ open, invoiceId, currency: lockedCurrency, initial, draft: initial });
      setServerBlock(null);
    } else {
      setSession({ ...session, open, invoiceId });
    }
  }

  const { amount, date, method, paymentFormSat, exchangeRate, reference, notes, stampRep } = session.draft;
  const currency = session.currency;
  const currencyChanged = currency !== lockedCurrency;
  const patchDraft = (patch: Partial<PaymentFormSnapshot>) =>
    setSession((current) => ({ ...current, draft: { ...current.draft, ...patch } }));

  // BL-11 (misma regla que valida el submit): si el monto capturado ya excede
  // el saldo, se explica de antemano en vez de esperar al toast de validación.
  const balanceRounded = roundMoney(balance);
  const parsedAmount = roundMoney(Number(amount));
  const exceedsBalance =
    Number.isFinite(parsedAmount) && parsedAmount - balanceRounded > 0.01;
  const amountBlock: BusinessBlock | null = exceedsBalance
    ? describeBusinessBlock("payment_exceeds_balance", {
        reason: `El monto es mayor que el saldo pendiente ($${balanceRounded.toFixed(2)}).`,
      })
    : serverBlock;
  const dateError = isValidPaymentDate(date) ? undefined : INVALID_PAYMENT_DATE_MESSAGE;

  const handleSubmit = async () => {
    if (currencyChanged) { notifyValidation({ message: PAYMENT_CURRENCY_CHANGED }); return; }
    setServerBlock(null);
    const amt = roundMoney(Number(amount));
    if (!amt || amt <= 0) { notifyValidation({ message: "Monto inválido" }); return; }
    // L-7: techo de monto — rechaza capturas absurdas antes de persistir.
    if (amt > MAX_PAYMENT_AMOUNT) {
      notifyValidation({
        message: "El monto excede el máximo permitido ($99,999,999.99). Verifica la cantidad.",
      });
      return;
    }
    // La captura vacía, parcial o rechazada por el calendario no conserva una
    // fecha anterior. Validar también aquí cubre Enter y submits programáticos.
    if (!isValidPaymentDate(date)) { notifyValidation({ message: INVALID_PAYMENT_DATE_MESSAGE }); return; }
    // R10 Bloque 8.1: la fecha de pago no puede ser futura (SAT rechaza REP con
    // fecha posterior a la del timbrado y contabilidad se rompe).
    const endOfToday = nowMty();
    endOfToday.setHours(23, 59, 59, 999);
    if (date > endOfToday) {
      notifyValidation({ message: "La fecha del pago no puede ser futura." });
      return;
    }
    // N-34: alineado con trg_payment_date_window — el pago no puede ser
    // anterior a la emisión de la factura. Validar en cliente evita el error
    // crudo del trigger.
    if (invoiceIssuedAt && toYMD(date) < invoiceIssuedAt.slice(0, 10)) {
      notifyValidation({
        message: `La fecha del pago no puede ser anterior a la fecha de emisión de la factura (${invoiceIssuedAt.slice(0, 10)}).`,
      });
      return;
    }
    // BL-11: rechazar sobrepagos. Antes se permitía registrar un pago mayor al
    // saldo (creando saldos negativos invisibles). Ahora bloqueamos en submit.
    if (amt - balanceRounded > 0.01) {
      notifyValidation({
        message: `El monto excede el saldo pendiente ($${balanceRounded.toFixed(2)}). Ajusta la cantidad.`,
      });
      return;
    }

    let exch = 1;
    if (currency !== "MXN") {
      const parsed = Number(exchangeRate);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        notifyValidation({ message: "Tipo de cambio inválido" });
        return;
      }
      exch = parsed;
    }

    createPayment.mutate(
      {
        invoice_id: invoiceId,
        amount: amt,
        payment_date: toYMD(date),
        payment_method: method,
        payment_form_sat: paymentFormSat,
        currency,
        exchange_rate: exch,
        reference_number: reference || null,
        notes: notes || null,
      },
      {
        onSuccess: async (created) => {
          notifySuccess("Pago registrado");
          if (ppdStamped && stampRep && created?.id) {
            stampComplement.mutate(created.id);
          }
          onOpenChange(false);
        },
        onError: (err) => {
          // Carrera: otro pago consumió el saldo. Se muestra el mismo bloque
          // explicable en vez de un toast técnico.
          const block = resolveBusinessBlock(err);
          if (block) {
            setServerBlock(block);
            return;
          }
          notifyError({ error: err });
        },
      },
    );
  };

  return {
    amount, setAmount: (value: string) => patchDraft({ amount: value }),
    date, setDate: (value?: Date) => patchDraft({ date: value }),
    method, setMethod: (value: string) => patchDraft({ method: value, paymentFormSat: satCodeForMethod(value) }),
    paymentFormSat, setPaymentFormSat: (value: string) => patchDraft({ paymentFormSat: value }),
    currency, lockedCurrency, setCurrency: (_value: string) => {},
    exchangeRate, setExchangeRate: (value: string) => patchDraft({ exchangeRate: value }),
    reference, setReference: (value: string) => patchDraft({ reference: value }),
    notes, setNotes: (value: string) => patchDraft({ notes: value }),
    stampRep, setStampRep: (value: boolean) => patchDraft({ stampRep: value }),
    createPayment, stampComplement, handleSubmit,
    isDirty: isPaymentFormDirty(session.draft, session.initial),
    amountBlock, exceedsBalance, dateError,
    currencyError: currencyChanged ? PAYMENT_CURRENCY_CHANGED : null,
  };
}
