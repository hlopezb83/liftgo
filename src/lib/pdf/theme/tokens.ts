// Industrial Minimalist palette + spacing for premium @react-pdf/renderer PDFs.
// All dimensions in points (1pt = 1/72in). A4 = 595x842pt.

export const COLORS = {
  gray900: "#111827",
  gray700: "#374151",
  gray500: "#6B7280",
  gray400: "#9CA3AF",
  gray200: "#E5E7EB",
  gray100: "#F3F4F6",
  gray50: "#F9FAFB",
  white: "#FFFFFF",
  accentGreen: "#16A34A",
  costRed: "#C83C3C",
  positiveGreen: "#167A3C",
  destructive: "#DC2626",
  warningAmber: "#EAB308",
  badgeOk: { fill: "#DCFCE7", text: "#166534" },
  badgeWarn: { fill: "#FEF3C7", text: "#92400E" },
  badgeBad: { fill: "#FEE2E2", text: "#991B1B" },
} as const;

export const FONT_SIZES = {
  xl: 14,
  lg: 11,
  md: 9,
  sm: 8,
  xs: 7,
  xxs: 6.5,
} as const;

// All in points
export const PAGE_MARGIN = 40; // ~14mm
export const ACCENT_BAR_HEIGHT = 4;
