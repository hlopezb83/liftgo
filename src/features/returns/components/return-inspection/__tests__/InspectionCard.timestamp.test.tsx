import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { InspectionCard } from "../InspectionCard";

describe("InspectionCard · hora y día local", () => {
  it.each([
    ["2026-09-27T02:05:39.541+00:00", "26/09/2026 20:05"],
    ["2026-09-26T20:05:39.541-06:00", "26/09/2026 20:05"],
  ])("muestra el instante de %s sin fijar medianoche", (inspected_at, expected) => {
    const ins = { inspected_at, condition: "good", inspected_by: "Admin Prueba" } as ReturnInspectionWithJoins;
    render(<InspectionCard ins={ins} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText("27/09/2026 00:00")).not.toBeInTheDocument();
    expect(screen.getByText("Admin Prueba")).toBeInTheDocument();
  });
});
