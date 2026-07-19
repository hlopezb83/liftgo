import { toYMD } from "@/lib/format/dateFormats";
import { useState, useEffect } from "react";
import { roundMoney } from "@/lib/money";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { satCodeForMethod } from "../../lib/paymentMethods";
import { useCreatePayment } from "../usePayments";
import { useStampPaymentComplement } from "./cfdi/usePaymentComplement";

interface Args {
  open: boolean;
  balance: number;
  ppdStamped: boolean;
  invoiceId: string;
  onOpenChange: (open: boolean) => void;
}

export function useRecordPaymentForm({ open, balance, ppdStamped, invoiceId, onOpenChange }: Args) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [date, setDate] = useState<Date>(nowMty());
  const [method, setMethod] = useState("transfer");
  const [paymentFormSat, setPaymentFormSat] = useState("03");
  const [currency, setCurrency] = useState("MXN");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [stampRep, setStampRep] = useState(true);
  const createPayment = useCreatePayment();
  const stampComplement = useStampPaymentComplement();

  useEffect(() => {
    if (open) {
      setAmount(balance.toFixed(2));
      setStampRep(ppdStamped);
    }
  }, [open, balance, ppdStamped]);

  useEffect(() => {
    setPaymentFormSat(satCodeForMethod(method));
  }, [method]);

  const handleSubmit = async () => {
    const amt = roundMoney(Number(amount));
    if (!amt || amt <= 0) { notifyValidation({ message: "Monto inválido" }); return; }
    // BL-11: rechazar sobrepagos. Antes se permitía registrar un pago mayor al
    // saldo (creando saldos negativos invisibles). Ahora bloqueamos en submit.
    const balanceRounded = roundMoney(balance);
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
          setAmount(balance.toFixed(2));
          setReference("");
          setNotes("");
        },
        onError: (err) => notifyError({ error: err }),
      },
    );
  };

  return {
    amount, setAmount, date, setDate, method, setMethod,
    paymentFormSat, setPaymentFormSat, currency, setCurrency,
    exchangeRate, setExchangeRate, reference, setReference,
    notes, setNotes, stampRep, setStampRep,
    createPayment, stampComplement, handleSubmit,
  };
}
