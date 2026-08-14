import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useForm } from "react-hook-form";
import { DeliveryFormFields, type DeliveryFormValues } from "../DeliveryFormFields";

function Harness({ bookings }: { bookings: Array<Record<string, unknown>> }) {
  const form = useForm<DeliveryFormValues>({
    defaultValues: {
      forkliftId: "", bookingId: "", type: "delivery", alreadyCompleted: false,
      scheduledDate: new Date(), scheduledTime: "", address: "", driverName: "",
      driverPhone: "", notes: "",
    },
  });
  return (
    <DeliveryFormFields
      form={form}
      forklifts={[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bookings={bookings as any}
      activeDrivers={[]}
    />
  );
}

describe("DeliveryFormFields", () => {
  // F9: sólo reservas `confirmed` deben ofrecerse; cancelled/completed son terminales.
  it("solo lista reservas confirmed en el selector", () => {
    render(
      <Harness
        bookings={[
          { id: "b1", customer_name: "Cliente A", start_date: "2024-01-01", end_date: "2024-01-05", forklift_id: "f1", status: "confirmed" },
          { id: "b2", customer_name: "Cliente B", start_date: "2024-01-01", end_date: "2024-01-05", forklift_id: "f1", status: "cancelled" },
          { id: "b3", customer_name: "Cliente C", start_date: "2024-01-01", end_date: "2024-01-05", forklift_id: "f1", status: "completed" },
        ]}
      />,
    );

    // Radix Select sólo monta las opciones al abrir el combobox (pointerdown).
    const triggers = screen.getAllByRole("combobox");
    for (const trigger of triggers) {
      fireEvent.pointerDown(
        trigger,
        new window.PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }),
      );
    }

    expect(screen.getByText(/Cliente A/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente B/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cliente C/)).not.toBeInTheDocument();
  });
});
