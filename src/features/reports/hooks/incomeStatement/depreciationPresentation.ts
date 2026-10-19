import { formatStatementAmount } from "./statementAmountPresentation";

export const DEPRECIATION_ROUNDING_LABEL = "Ajuste de redondeo de depreciación";

interface DepreciationAmounts {
  depreciation: number;
  depreciationRented: number;
  depreciationIdle: number;
}

// Count the actual displayed cents without pre-rounding intermediate values.
// This adjustment is presentation only and never feeds back into totals.
const displayedCents = (amount: number) => Number.isFinite(amount)
  ? Math.round(Number(formatStatementAmount(amount)) * 100)
  : 0;

export function depreciationRoundingAdjustment(amounts: DepreciationAmounts): number {
  return (
    displayedCents(amounts.depreciation)
    - displayedCents(amounts.depreciationRented)
    - displayedCents(amounts.depreciationIdle)
  ) / 100;
}
