// Thin barrel — re-exports the modular premium quote/invoice PDF helpers.
// See src/lib/pdf/quote/ for implementations.
export {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200, GRAY_100, GRAY_50,
  MARGIN,
} from "./quote/constants";
export { drawAccentBar, drawPremiumHeader, drawInfoCardsAt } from "./quote/header";
export { drawPremiumTable } from "./quote/table";
export { drawBottomSection, drawFooter } from "./quote/totals";
