import { useContext } from "react";
import { ConfirmContext, type Confirm } from "./confirmContext";

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}
