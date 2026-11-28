import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { EquipmentAssignmentDialog } from "../EquipmentAssignmentDialog";

const state = vi.hoisted(() => ({ availableForklifts: [{ id: "unit-1" }] }));
vi.mock("@/features/availability", () => ({
  computeFleetAvailability: () => ({ rentedForkliftIds: new Set() }),
  useServerTodayMty: () => "2026-10-20",
}));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({
  useAvailableForklifts: () => ({
    availableForklifts: state.availableForklifts,
    datesSelected: true,
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const unit = {
  id: "unit-1",
  name: "QA-001",
  equipment_model_id: "model-1",
  status: "available",
  manufacturer: "Toyota",
  model: "8FG25",
} as Tables<"forklifts">;
const baseModel = {
  id: "model-1",
  manufacturer: "Toyota",
  model: "8FG25",
  default_daily_rate: 100,
  default_weekly_rate: 500,
  default_monthly_rate: 1500,
} as Tables<"equipment_models">;
const props = {
  open: true,
  onOpenChange: vi.fn(),
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  rentalMeta: [
    {
      modelId: "model-1",
      quantity: 1,
      dailyRate: 100,
      weeklyRate: 500,
      monthlyRate: 1500,
    },
  ],
  forklifts: [unit],
  onConfirm: vi.fn(),
};

afterEach(cleanup);
beforeEach(() => {
  state.availableForklifts = [{ id: "unit-1" }];
});

describe("Audit: equipment assignment must use stable model identity", () => {
  it("control: available unit with identical labels is selectable", () => {
    render(<EquipmentAssignmentDialog {...props} models={[baseModel]} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("available unit remains selectable after the catalog renames its model", () => {
    render(
      <EquipmentAssignmentDialog
        {...props}
        models={[{ ...baseModel, model: "8FG25 (LPG)" }]}
      />,
    );
    // Same stable model ID, and get_available_forklifts explicitly returned unit-1.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("does not match a different model ID even when labels are identical", () => {
    render(
      <EquipmentAssignmentDialog
        {...props}
        forklifts={[{ ...unit, equipment_model_id: "other-model" }]}
        models={[baseModel]}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("does not offer legacy units without the model ID required by conversion", () => {
    render(
      <EquipmentAssignmentDialog
        {...props}
        forklifts={[{ ...unit, equipment_model_id: null }]}
        models={[baseModel]}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("still honors the server availability exclusion after a label rename", () => {
    state.availableForklifts = [];
    render(
      <EquipmentAssignmentDialog
        {...props}
        models={[{ ...baseModel, model: "8FG25 (LPG)" }]}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
