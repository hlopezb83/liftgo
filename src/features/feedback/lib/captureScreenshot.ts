/**
 * Captura screenshot del documento usando html2canvas (lazy import).
 * Opcionalmente dibuja un marco rojo sobre un rectángulo (elemento señalado).
 */

interface CaptureOptions {
  highlightRect?: { x: number; y: number; width: number; height: number };
}

export async function captureScreenshotFile(options: CaptureOptions = {}): Promise<File | null> {
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      scale: Math.min(window.devicePixelRatio, 2),
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });

    if (options.highlightRect) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const scale = canvas.width / window.innerWidth;
        const r = options.highlightRect;
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 4 * scale;
        const scrollY = window.scrollY * scale;
        const scrollX = window.scrollX * scale;
        ctx.strokeRect(
          r.x * scale + scrollX,
          r.y * scale + scrollY,
          r.width * scale,
          r.height * scale,
        );
      }
    }

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.85));
    if (!blob) return null;
    return new File([blob], `feedback-${Date.now()}.png`, { type: "image/png" });
  } catch (err: unknown) {
    console.error("[captureScreenshot] failed", err);
    return null;
  }
}
