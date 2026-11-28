import { useRef, useState, useEffect } from "react";
import SignaturePadEngine from "signature_pad";
import { Eraser, UndoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  onSave: (base64: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

export function SignaturePad({ onSave, onClear, width = 400, height = 200, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadEngine | null>(null);
  const resizeRef = useRef<(() => void) | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext("2d")) return;
    const pad = new SignaturePadEngine(canvas, {
      backgroundColor: "white",
      penColor: "black",
      minWidth: 1,
      maxWidth: 1,
      // No trailing move callback may mutate the image after disabling it.
      throttle: 0,
    });
    padRef.current = pad;
    const update = () => setHasDrawn(!pad.isEmpty());
    pad.addEventListener("endStroke", update);
    pad.addEventListener("afterUpdateStroke", update);
    let cssWidth = 0;
    let cssHeight = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return; // Hidden dialog: wait until visible.
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const pixelWidth = Math.round(rect.width * ratio);
      const pixelHeight = Math.round(rect.height * ratio);
      if (canvas.width === pixelWidth && canvas.height === pixelHeight && cssWidth === rect.width && cssHeight === rect.height) return;
      const data = pad.toData().map((group) => ({
        ...group,
        points: group.points.map((point) => ({
          ...point,
          x: cssWidth ? point.x * rect.width / cssWidth : point.x,
          y: cssHeight ? point.y * rect.height / cssHeight : point.y,
        })),
      }));
      // Finish any interrupted stroke before replacing the backing canvas.
      pad.off();
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
      pad.fromData(data);
      cssWidth = rect.width;
      cssHeight = rect.height;
      if (canvas.getAttribute("aria-disabled") !== "true") pad.on();
      update();
    };
    resizeRef.current = resize;
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      pad.removeEventListener("endStroke", update);
      pad.removeEventListener("afterUpdateStroke", update);
      pad.off();
      padRef.current = null;
      resizeRef.current = null;
    };
  }, []);

  useEffect(() => { resizeRef.current?.(); }, [width, height]);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    pad.off();
    // Reset pointer ownership as well as listeners when a save interrupts a stroke.
    pad.fromData(pad.toData());
    if (!disabled) pad.on();
  }, [disabled]);

  const clear = () => {
    if (disabled || !padRef.current) return;
    padRef.current.off();
    padRef.current.clear();
    padRef.current.on();
    setHasDrawn(false);
    onClear?.();
  };

  const undo = () => {
    const pad = padRef.current;
    if (disabled || !pad) return;
    pad.off();
    pad.fromData(pad.toData().slice(0, -1));
    pad.on();
    setHasDrawn(!pad.isEmpty());
  };

  const save = () => {
    const pad = padRef.current;
    if (disabled || !pad || pad.isEmpty()) return;
    onSave(pad.toDataURL("image/png"));
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative border rounded-lg overflow-hidden bg-background">
        <canvas
          ref={canvasRef}
          aria-label="Firma del cliente"
          aria-disabled={disabled}
          className="block w-full max-w-full touch-none cursor-crosshair"
          style={{ aspectRatio: `${width}/${height}`, height: "auto" }}
        />
        {/* Dotted signature line */}
        <div
          className="absolute left-[10%] right-[10%] border-b-2 border-dashed border-muted-foreground/30 pointer-events-none"
          style={{ bottom: "25%" }}
        />
        {!hasDrawn && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none select-none">
            Firme aquí
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={disabled || !hasDrawn}>
          <UndoIcon className="h-4 w-4 mr-1" /> Deshacer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled}>
          <Eraser className="h-4 w-4 mr-1" /> Limpiar
        </Button>
        <Button type="button" size="sm" className="col-span-2 sm:ml-auto" onClick={save} disabled={disabled || !hasDrawn}>
          Confirmar Firma
        </Button>
      </div>
    </div>
  );
}
