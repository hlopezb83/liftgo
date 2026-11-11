import { useId, type PropsWithChildren } from "react";
import { FormErrorScope } from "@/lib/forms/formErrorTargets";

/** Opt-in anchors: existing forms keep their IDs and geometry unchanged. */
export function FormErrorSummaryScope({ children }: PropsWithChildren) {
  const id = useId();
  return <FormErrorScope value={id}>{children}</FormErrorScope>;
}
