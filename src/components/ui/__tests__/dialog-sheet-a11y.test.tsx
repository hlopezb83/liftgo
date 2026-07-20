import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

// UX-M3: los botones de cierre de Dialog y Sheet exponen "Cerrar" en es-MX.
describe("Dialog/Sheet a11y — sr-only en español", () => {
  it("Dialog Close usa 'Cerrar'", () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger>abrir</DialogTrigger>
        <DialogContent>
          <DialogTitle>Prueba</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Cerrar")).toBeInTheDocument();
  });

  it("Sheet Close usa 'Cerrar'", () => {
    render(
      <Sheet defaultOpen>
        <SheetTrigger>abrir</SheetTrigger>
        <SheetContent>
          <SheetTitle>Prueba</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText("Cerrar")).toBeInTheDocument();
  });
});
