import { useState, useEffect } from "react";
import { format } from "date-fns";

import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { roundMoney } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import { useCreatePayment } from "../usePayments";
import { useStampPaymentComplement } from "./cfdi/usePaymentComplement";
import { satCodeForMethod } from "../../lib/paymentMethods";

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
    if (!amt || amt <= 0) { notifyError({ message: "Monto inválido" }); return; }
    let exch = 1;
    if (currency !== "MXN") {
      const parsed = Number(exchangeRate);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        notifyError({ message: "Tipo de cambio inválido" });
        return;
      }
      exch = parsed;
    }

    createPayment.mutate(
      {
        invoice_id: invoiceId,
        amount: amt,
        payment_date: format(date, "yyyy-MM-dd"),
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
