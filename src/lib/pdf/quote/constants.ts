// ─── Industrial Minimalist palette + typography for premium quote/invoice PDFs ───
export const GRAY_900 = { r: 17, g: 24, b: 39 };
export const GRAY_700 = { r: 55, g: 65, b: 81 };
export const GRAY_500 = { r: 107, g: 114, b: 128 };


export const GRAY_200 = { r: 229, g: 231, b: 235 };
export const GRAY_100 = { r: 243, g: 244, b: 246 };
export const GRAY_50 = { r: 249, g: 250, b: 251 };

export const FONT_XL = 14;
export const FONT_LG = 10;
export const FONT_MD = 8;
export const FONT_SM = 6.5;

export const MARGIN = 20;

// ─── PNG dimension helper ─────────────────────────────
export function getPngDimensions(b64: string): { w: number; h: number } {
  try {
    const bin = atob(b64.replace(/^data:image\/\w+;base64,/, ""));
    const w =
      (bin.charCodeAt(16) << 24) |
      (bin.charCodeAt(17) << 16) |
      (bin.charCodeAt(18) << 8) |
      bin.charCodeAt(19);
    const h =
      (bin.charCodeAt(20) << 24) |
      (bin.charCodeAt(21) << 16) |
      (bin.charCodeAt(22) << 8) |
      bin.charCodeAt(23);
    if (w > 0 && h > 0) return { w, h };
  } catch { /* fall through */ }
  return { w: 1, h: 1 };
}
