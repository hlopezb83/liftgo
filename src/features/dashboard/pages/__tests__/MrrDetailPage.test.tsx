import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

/**
 * MrrDetailPage — fallback tablet/mobile.
 * Riesgo: si cae al DataTableV2 debajo de md, la columna 'Periodo' se recorta
 * en 698px (regresión del sprint v7.78.0).
 */

const useMrrDetailMock = vi.fn();
const useIsTabletOrBelowMock = vi.fn();

vi.mock("../../hooks/useMrrDetail", () => ({
  useMrrDetail: () => useMrrDetailMock(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsTabletOrBelow: () => useIsTabletOrBelowMock(),
  useIsMobile: () => false,
}));

import MrrDetailPage from "../MrrDetailPage";

const sampleItem = {
  forklift_id: "fk-1",
  forklift_name: "FK-001",
  model: "H25",
  manufacturer: "Hyster",
  serial_number: "SN1",
  monthly_rate: 12000,
  daily_rate: 500,
  weekly_rate: 3000,
  customer_name: "ACME",
  customer_id: "c-1",
  booking_number: "RSV-0001",
  start_date: "2026-06-01",
  end_date: "2026-06-30",
};

function renderPage() {
  const { Wrapper } = createQueryWrapper();
  return render(
    <Wrapper>
      <MemoryRouter>
        <MrrDetailPage />
      </MemoryRouter>
    </Wrapper>,
  );
}

beforeEach(() => {
  useMrrDetailMock.mockReset();
  useIsTabletOrBelowMock.mockReset();
});

describe("MrrDetailPage", () => {
  it("en tablet/mobile renderiza MobileCardList (sin table) y conserva el Total MRR", () => {
    useIsTabletOrBelowMock.mockReturnValue(true);
    useMrrDetailMock.mockReturnValue({
      data: { items: [sampleItem], total_mrr: 12000 },
      isLoading: false,
    });

    renderPage();

    // El fallback mobile no debe renderizar el <table> del DataTableV2.
    expect(screen.queryByRole("table")).toBeNull();
    // Total MRR sigue visible como subtotal debajo de las cards.
    expect(screen.getAllByText(/Total MRR/i).length).toBeGreaterThan(0);
    // La card muestra el equipo.
    expect(screen.getByText("FK-001")).toBeInTheDocument();
  });

  it("en desktop renderiza la tabla (DataTableV2)", () => {
    useIsTabletOrBelowMock.mockReturnValue(false);
    useMrrDetailMock.mockReturnValue({
      data: { items: [sampleItem], total_mrr: 12000 },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
