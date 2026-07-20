import { useState, useEffect, useCallback, type TouchEvent as ReactTouchEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon, X, ZoomIn, ZoomOut } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ImageGalleryLightboxProps {
  images: { url: string; name: string }[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageGalleryLightbox({ images, initialIndex = 0, open, onOpenChange }: ImageGalleryLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Prev-prop guard: resetea el índice/zoom cuando abre el lightbox.
  const [prevOpenKey, setPrevOpenKey] = useState<string>("closed");
  const nextOpenKey = open ? `open-${initialIndex}` : "closed";
  if (prevOpenKey !== nextOpenKey) {
    setPrevOpenKey(nextOpenKey);
    if (open) { setCurrent(initialIndex); setZoomed(false); }
  }

  const prev = useCallback(() => { setCurrent((c) => (c > 0 ? c - 1 : images.length - 1)); setZoomed(false); }, [images.length]);
  const next = useCallback(() => { setCurrent((c) => (c < images.length - 1 ? c + 1 : 0)); setZoomed(false); }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, prev, next, onOpenChange]);

  if (images.length === 0) return null;

  const handleTouchStart = (e: ReactTouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 60) { if (diff > 0) prev(); else next(); }
    setTouchStart(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 bg-background/95 backdrop-blur-sm border-none [&>button]:hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background/80 to-transparent">
          <span className="text-sm text-muted-foreground font-mono">
            {current + 1} / {images.length}
          </span>
          <span className="text-sm text-foreground truncate max-w-[50%]">{images[current]?.name}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="iconSm" onClick={() => setZoomed(!zoomed)} aria-label={zoomed ? "Alejar imagen" : "Acercar imagen"}>
              {zoomed ? <ZoomOut /> : <ZoomIn />}
            </Button>
            <Button variant="ghost" size="iconSm" onClick={() => onOpenChange(false)} aria-label="Cerrar galería">
              <X />
            </Button>
          </div>
        </div>

        {/* Image area */}
        <div
          className="flex items-center justify-center w-full h-full overflow-auto"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={() => setZoomed(!zoomed)}
            aria-label={zoomed ? "Alejar imagen" : "Acercar imagen"}
            className="border-0 bg-transparent p-0 cursor-inherit"
          >
            <img
              src={images[current]?.url}
              alt={images[current]?.name}
              className={cn(
                "max-h-[85vh] transition-transform duration-200 select-none",
                zoomed ? "max-w-none cursor-zoom-out scale-150" : "max-w-full cursor-zoom-in object-contain"
              )}
              draggable={false}
            />
          </button>
        </div>

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/60 hover:bg-background/80"
              onClick={prev}
              aria-label="Imagen anterior"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/60 hover:bg-background/80"
              onClick={next}
              aria-label="Siguiente imagen"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center gap-1.5 px-4 py-3 bg-gradient-to-t from-background/80 to-transparent overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setCurrent(i); setZoomed(false); }}
                aria-label={`Ver imagen ${i + 1}: ${img.name}`}
                aria-current={i === current ? "true" : undefined}
                className={cn(
                  "w-12 h-12 rounded-md overflow-hidden border-2 shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === current ? "border-primary ring-1 ring-primary/30" : "border-transparent opacity-60 hover:opacity-100"
                )}
              >
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
