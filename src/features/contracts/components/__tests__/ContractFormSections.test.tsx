import { render, screen, cleanup } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import { Form } from "@/components/ui/form";
import { buildPagareVars } from "@/lib/pdf/contract/placeholders";
import { UsageConditionsCard } from "../ContractFormSections";

afterEach(cleanup);

function Harness({ rate }: { rate: string }) {
  const form = useForm({ defaultValues: {
    usage_location: "Monterrey", max_hours_per_month: "200", extra_hour_rate: "150",
    payment_frequency: "Mensual", late_interest_rate: rate, contract_city: "Monterrey",
  } });
  return <Form {...form}><UsageConditionsCard control={form.control} /></Form>;
}

describe("Ayuda de interés moratorio", () => {
  it("explica que el cero explícito se conserva en ambos documentos", () => {
    render(<Harness rate="0" />);
    expect(screen.getByText("Se imprimirá 0% de interés moratorio en el contrato y en el pagaré.")).toBeInTheDocument();
    expect(buildPagareVars({ interes_moratorio: "0" }).interes_moratorio).toBe("0");
    expect(screen.queryByText(/usará 5%/)).not.toBeInTheDocument();
  });

  it.each(["", "5"])("no anuncia cero para una tasa %j", (rate) => {
    render(<Harness rate={rate} />);
    expect(screen.queryByText(/Se imprimirá 0%/)).not.toBeInTheDocument();
  });
});
