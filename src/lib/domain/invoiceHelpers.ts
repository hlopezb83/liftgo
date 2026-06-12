// Barrel re-exports. Implementations live in ./invoiceTotals and ./rentalCalculation.
// Split per Power-of-10 size limits while preserving the public API.
export {
  type LineItem,
  type SaleLineInput,
  lineItemTotal,
  applyDiscountToBase,
  applyDiscount,
  saleLineTotal,
  computeTotals,
} from "./invoiceTotals";

export {
  calculateRentalCost,
  generateLineItems,
  generateLineItemsFromModel,
} from "./rentalCalculation";
