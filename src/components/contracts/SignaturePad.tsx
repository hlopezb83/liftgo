import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Undo2 } from "lucide-react";

interface SignaturePadProps {
  onSave: (base64: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
}

export function SignaturePad({ onSave, onClear, width = 400, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);

  const getCtx = useCallback(() => canvasRef.current?.getContext("2d"), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const saveSnapshot = () => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    saveSnapshot();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handlePointerUp = () => setIsDrawing(false);

  const clear = () => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHistory([]);
    setHasDrawn(false);
    onClear?.();
  };

  const undo = () => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas || history.length === 0) return;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
    if (history.length <= 1) setHasDrawn(false);
  };

  const save = () => {
    if (!canvasRef.current || !hasDrawn) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <div className="relative border rounded-lg overflow-hidden bg-background">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none cursor-crosshair"
          style={{ aspectRatio: `${width}/${height}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
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
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
          <Undo2 className="h-4 w-4 mr-1" /> Deshacer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="h-4 w-4 mr-1" /> Limpiar
        </Button>
        <div className="flex-1" />
        <Button type="button" size="sm" onClick={save} disabled={!hasDrawn}>
          Confirmar Firma
        </Button>
      </div>
    </div>
  );
}
