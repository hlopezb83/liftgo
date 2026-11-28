import { describe, expect, it } from "vitest";
import { selectableBookings } from "../selectableBookings";

const booking = (id: string, status: string, forkliftId = "f1") => ({
  id,
  customer_name: `Cliente ${id}`,
  start_date: "2024-01-01",
  end_date: "2024-01-05",
  forklift_id: forkliftId,
  status,
});

describe("selectableBookings (F9)", () => {
  const bookings = [
    booking("b1", "confirmed"),
    booking("b2", "cancelled"),
    booking("b3", "completed"),
    booking("b4", "confirmed", "f2"),
  ];

  it("excluye reservas canceladas y completadas", () => {
    expect(selectableBookings(bookings, undefined)?.map((b) => b.id)).toEqual(["b1", "b4"]);
  });

  it("además filtra por el montacargas seleccionado", () => {
    expect(selectableBookings(bookings, "f1")?.map((b) => b.id)).toEqual(["b1"]);
  });

  it("tolera la lista indefinida", () => {
    expect(selectableBookings(undefined, "f1")).toBeUndefined();
  });
});
