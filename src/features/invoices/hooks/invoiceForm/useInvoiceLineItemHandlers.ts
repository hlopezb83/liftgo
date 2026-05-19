import currency from "currency.js";
import type { CfdiLineItem } from "@/features/invoices/components/invoice-form/EditableLineItemsTable";
import type { useInvoiceFormState, CfdiFormState } from "./useInvoiceFormState";

type State = ReturnType<typeof useInvoiceFormState>;

const EMPTY_LINE: CfdiLineItem = {
  description: "", quantity: 1, unit_price: 0, total: 0,
  clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
};

export function useInvoiceLineItemHandlers(state: State) {
  const updateLineItem = (index: number, field: string, value: string | number) => {
    state.setLineItems((previous) => previous.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        updated.total = Math.round(Number(updated.quantity) * Number(updated.unit_price) * 100) / 100;
      }
      return updated;
    }));
  };

  const addLineItem = () => state.setLineItems((previous) => [...previous, { ...EMPTY_LINE }]);

  const removeLineItem = (index: number) =>
    state.setLineItems((previous) => previous.filter((_, i) => i !== index));

  const handleCfdiUpdate = (field: string, value: string | number) => {
    state.setCfdi(field as keyof CfdiFormState, value as CfdiFormState[keyof CfdiFormState]);
  };

  return { updateLineItem, addLineItem, removeLineItem, handleCfdiUpdate };
}
