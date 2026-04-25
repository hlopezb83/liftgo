// Thin barrel — re-exports the modular premium quote/invoice PDF helpers.
// See src/lib/pdf/quote/ for implementations.
export {
  GRAY_900, GRAY_700, GRAY_500, GRAY_400, GRAY_200, GRAY_100, GRAY_50,
  MARGIN,
} from "./pdf/quote/constants";
export { drawAccentBar, drawPremiumHeader, drawInfoCardsAt } from "./pdf/quote/header";
export { drawPremiumTable } from "./pdf/quote/table";
export { drawBottomSection, drawFooter } from "./pdf/quote/totals";
