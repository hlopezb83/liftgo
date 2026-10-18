import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

function token(selector: string, name: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Falta selector ${selector}`);
  const block = css.slice(start, css.indexOf("}", start));
  const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Falta token ${name} en ${selector}`);
  return value.trim();
}

function rgb(hsl: string) {
  const [h, sPercent, lPercent] = hsl.split(/\s+/).map(parseFloat);
  const s = sPercent / 100, l = lPercent / 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}

function luminance(color: number[]) {
  const linear = color.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function ratio(a: number[], b: number[]) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("Tokens locales de contraste — V01", () => {
  const primary = rgb(token(".auth-brandscape", "primary"));
  const white = rgb(token(".auth-brandscape", "primary-foreground"));
  const backgrounds = [token(".auth-brandscape", "card"), token(".auth-brandscape", "background")];

  it.each(backgrounds)("CTA y enlaces alcanzan 4.5:1 sobre %s, incluso con hover/90", (background) => {
    const bg = rgb(background);
    const hover = primary.map((v, i) => v * 0.9 + bg[i] * 0.1);
    expect(ratio(white, primary)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(white, hover)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(primary, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("el anillo local alcanza 3:1 en ambos fondos sin depender de .dark heredado", () => {
    const ring = rgb(token(".auth-brandscape", "ring"));
    for (const bg of backgrounds) expect(ratio(ring, rgb(bg))).toBeGreaterThanOrEqual(3);
  });

  it.each([":root", ".dark"])("warning-text alcanza 4.5:1 sobre el fondo %s", (selector) => {
    expect(ratio(rgb(token(selector, "warning-text")), rgb(token(selector, "background")))).toBeGreaterThanOrEqual(4.5);
  });
});