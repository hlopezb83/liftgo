import { roundMoney } from "@/lib/money";

export const DEPRECIATION_ROUNDING_LABEL = "Ajuste de redondeo de depreciación";

interface DepreciationAmounts {
  depreciation: number;
  depreciationRented: number;
  depreciationIdle: number;
}

// Currency formatting rounds both signs away from zero at a half cent.
// Work with displayed cents here only; never feed this adjustment into totals.
const displayedCents = (amount: number) =>
  Math.sign(amount) * Math.round(roundMoney(Math.abs(amount)) * 100);

export function depreciationRoundingAdjustment(amounts: DepreciationAmounts): number {
  return (
    displayedCents(amounts.depreciation)
    - displayedCents(amounts.depreciationRented)
    - displayedCents(amounts.depreciationIdle)
  ) / 100;
}
