import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailRow } from "@/components/domain/DetailRow";
import { InfoIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AuditLogMobileCard } from "@/features/audit/components/auditTrail/AuditLogMobileCard";
import { DamageEvidenceSection } from "@/features/damage/components/DamageEvidenceSection";
import { OfflineBanner } from "@/layouts/OfflineBanner";

describe("GUI & UX micro-improvements", () => {
  it("marca visualmente campos inválidos con aria-[invalid=true]:border-destructive", () => {
    render(
      <div>
        <Input aria-label="Campo texto" aria-invalid="true" />
        <Textarea aria-label="Área texto" aria-invalid="true" />
        <Select value="a">
          <SelectTrigger aria-label="Selector" aria-invalid="true">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Opción A</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );

    expect(screen.getByLabelText("Campo texto")).toHaveClass("aria-[invalid=true]:border-destructive");
    expect(screen.getByLabelText("Área texto")).toHaveClass("aria-[invalid=true]:border-destructive");
    expect(screen.getByRole("combobox", { name: "Selector" })).toHaveClass("aria-[invalid=true]:border-destructive");
  });

  it("OfflineBanner soporta modo inline sin cubrir la barra superior con position:fixed", () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    try {
      const { unmount } = render(<OfflineBanner inline />);
      const banner = screen.getByRole("status");
      expect(banner).toHaveClass("w-full");
      expect(banner).not.toHaveClass("fixed");
      unmount();

      render(<OfflineBanner />);
      expect(screen.getByRole("status")).toHaveClass("fixed");
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: original });
    }
  });

  it("DetailRow conserva el valor numérico 0 en lugar de reemplazarlo por guion", () => {
    render(
      <div>
        <DetailRow icon={InfoIcon} label="Cantidad" value={0} />
        <DetailRow icon={InfoIcon} label="Vacío" value="" />
      </div>,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("DamageEvidenceSection expone botón accesible, en español y visible en táctil para quitar fotos", () => {
    const onRemove = vi.fn();
    const file = new File(["img"], "evidencia.jpg", { type: "image/jpeg" });
    render(
      <DamageEvidenceSection
        previews={[{ file, url: "blob:evidencia-1" }]}
        onDrop={vi.fn()}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByAltText("Vista previa 1")).toBeInTheDocument();
    const removeBtn = screen.getByRole("button", { name: "Quitar foto 1" });
    expect(removeBtn).toHaveAttribute("type", "button");
    expect(removeBtn).toHaveClass("touch:opacity-100");
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("AuditLogMobileCard permite abrir el detalle con teclado sin anidar botones", () => {
    const onSelect = vi.fn();
    const onDeleteRequest = vi.fn();
    const log = {
      id: "log-1",
      action: "UPDATE",
      table_name: "invoices",
      record_id: "inv-1",
      old_data: null,
      new_data: { invoice_number: "FAC-001" },
      changed_fields: ["status"],
      user_id: "u-1",
      user_email: "operaciones.muy.largo@empresa-industrial.com.mx",
      created_at: "2026-11-26T12:00:00Z",
      organization_id: "org-1",
    };

    render(
      <AuditLogMobileCard
        log={log}
        isAdmin={true}
        onSelect={onSelect}
        onDeleteRequest={onDeleteRequest}
      />,
    );

    const revertBtn = screen.getByRole("button", { name: /Revertir acción en/i });
    const detailBtn = screen.getByRole("button", { name: /Tabla:\s*Facturas/i });
    expect(revertBtn.contains(detailBtn)).toBe(false);
    expect(detailBtn.contains(revertBtn)).toBe(false);

    fireEvent.click(detailBtn);
    expect(onSelect).toHaveBeenCalledWith(log);
    expect(onDeleteRequest).not.toHaveBeenCalled();

    fireEvent.click(revertBtn);
    expect(onDeleteRequest).toHaveBeenCalledWith(log);
  });

  it("NativeSelect mantiene asociación con label, estado inválido, touch target, fieldset disabled e ícono decorativo", () => {
    const onChange = vi.fn();
    const { container } = render(
      <div>
        <label htmlFor="native-sel-1">Estado</label>
        <NativeSelect id="native-sel-1" aria-invalid="true" value="a" onChange={(e) => onChange(e.target.value)}>
          <option value="a">Activo</option>
          <option value="b">Inactivo</option>
        </NativeSelect>
        <fieldset disabled>
          <label htmlFor="native-sel-2">Bloqueado</label>
          <NativeSelect id="native-sel-2" defaultValue="">
            <option value="">Selecciona</option>
          </NativeSelect>
        </fieldset>
      </div>,
    );

    const sel1 = screen.getByLabelText("Estado");
    expect(sel1).toHaveClass("border-input", "touch:min-h-11", "aria-[invalid=true]:border-destructive");
    fireEvent.change(sel1, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");

    const sel2 = screen.getByLabelText("Bloqueado");
    expect(sel2).toBeDisabled();

    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBe(2);
  });
});
