/**
 * Captura screenshot del documento usando html-to-image (lazy import).
 * Es ~4x más ligero que html2canvas y produce PNG data URL directamente.
 * Opcionalmente dibuja un marco rojo sobre un rectángulo (elemento señalado).
 */

interface CaptureOptions {
  highlightRect?: { x: number; y: number; width: number; height: number };
}

const MAX_SCALE = 2;

function drawHighlight(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = canvas.width / window.innerWidth;
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 4 * scale;
  ctx.strokeRect(
    rect.x * scale + window.scrollX * scale,
    rect.y * scale + window.scrollY * scale,
    rect.width * scale,
    rect.height * scale,
  );
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0);
  return canvas;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.85));
}

export async function captureScreenshotFile(options: CaptureOptions = {}): Promise<File | null> {
  try {
    const { toPng } = await import("html-to-image");
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
    const dataUrl = await toPng(document.body, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: "#ffffff",
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    });

    let canvas: HTMLCanvasElement;
    if (options.highlightRect) {
      const img = await loadImage(dataUrl);
      canvas = imageToCanvas(img);
      drawHighlight(canvas, options.highlightRect);
    } else {
      // Fast-path: convertir data URL a Blob sin re-decodificar en canvas.
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return new File([blob], `feedback-${Date.now()}.png`, { type: "image/png" });
    }

    const blob = await canvasToBlob(canvas);
    if (!blob) return null;
    return new File([blob], `feedback-${Date.now()}.png`, { type: "image/png" });
  } catch (err: unknown) {
    console.error("[captureScreenshot] failed", err);
    return null;
  }
}
