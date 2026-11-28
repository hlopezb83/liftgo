import { useForm, Controller } from "react-hook-form";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RentalLineItems, type RentalLine } from "../RentalLineItems";
import type { EquipmentModel } from "@/features/fleet";
const models = [
  {
    id: "A",
    manufacturer: "QA",
    model: "A",
    default_daily_rate: 100,
    default_weekly_rate: 600,
    default_monthly_rate: 2000,
  },
  {
    id: "B",
    manufacturer: "QA",
    model: "B",
    default_daily_rate: 900,
    default_weekly_rate: 5000,
    default_monthly_rate: 18000,
  },
] as EquipmentModel[];
function Harness() {
  const form = useForm<{ lines: RentalLine[] }>({
    defaultValues: {
      lines: [
        {
          modelId: "",
          quantity: 1,
          dailyRate: 0,
          weeklyRate: 0,
          monthlyRate: 0,
          discount: 0,
          discountType: "%",
        },
      ],
    },
  });
  return (
    <Controller
      control={form.control}
      name="lines"
      render={({ field }) => (
        <>
          <RentalLineItems
            lines={field.value}
            onChange={field.onChange}
            models={models}
          />
          <output data-testid="state">{JSON.stringify(field.value)}</output>
        </>
      )}
    />
  );
}
describe("Rental model context audit", () => {
  it("refreshes untouched auto-filled rates for B through real RHF field cloning", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "QA — A" }));
    expect(
      JSON.parse(screen.getByTestId("state").textContent!)[0],
    ).toMatchObject({ modelId: "A", dailyRate: 100 });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "QA — B" }));
    expect(
      JSON.parse(screen.getByTestId("state").textContent!)[0],
    ).toMatchObject({
      modelId: "B",
      dailyRate: 900,
      weeklyRate: 5000,
      monthlyRate: 18000,
    });
    expect(screen.getByRole("combobox")).toHaveTextContent("QA — B");
  });
});

it("preserves an explicitly edited rate while refreshing untouched automatic rates", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "QA — A" }));
  fireEvent.change(screen.getAllByRole("spinbutton")[1], {
    target: { value: "123" },
  });
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "QA — B" }));
  expect(JSON.parse(screen.getByTestId("state").textContent!)[0]).toMatchObject(
    { dailyRate: 123, weeklyRate: 5000, monthlyRate: 18000 },
  );
});
it("preserves existing negotiated prices, even when equal to a catalog rate", () => {
  function Existing() {
    const [lines, setLines] = useState<RentalLine[]>([
      {
        modelId: "A",
        quantity: 1,
        dailyRate: 100,
        weeklyRate: 555,
        monthlyRate: 1800,
        discount: 0,
        discountType: "%",
      },
    ]);
    return (
      <>
        <RentalLineItems lines={lines} onChange={setLines} models={models} />
        <output data-testid="state">{JSON.stringify(lines)}</output>
      </>
    );
  }
  render(<Existing />);
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "QA — B" }));
  expect(JSON.parse(screen.getByTestId("state").textContent!)[0]).toMatchObject(
    { dailyRate: 100, weeklyRate: 555, monthlyRate: 1800 },
  );
});

it("preserves an explicitly entered zero rate", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "QA — A" }));
  fireEvent.change(screen.getAllByRole("spinbutton")[1], {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "QA — B" }));
  expect(JSON.parse(screen.getByTestId("state").textContent!)[0]).toMatchObject(
    { dailyRate: 0, weeklyRate: 5000, monthlyRate: 18000 },
  );
});

it("preserves historical zero rates when switching an existing model", () => {
  function HistoricalZero() {
    const [lines, setLines] = useState<RentalLine[]>([
      {
        modelId: "A",
        quantity: 1,
        dailyRate: 0,
        weeklyRate: 0,
        monthlyRate: 1800,
        discount: 0,
        discountType: "%",
      },
    ]);
    return (
      <>
        <RentalLineItems lines={lines} onChange={setLines} models={models} />
        <output data-testid="state">{JSON.stringify(lines)}</output>
      </>
    );
  }
  render(<HistoricalZero />);
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "QA — B" }));
  expect(JSON.parse(screen.getByTestId("state").textContent!)[0]).toMatchObject(
    { modelId: "B", dailyRate: 0, weeklyRate: 0, monthlyRate: 1800 },
  );
});
