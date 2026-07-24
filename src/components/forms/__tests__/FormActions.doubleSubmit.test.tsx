// @vitest-environment jsdom
// TESTS-ARQ2 (v7.220.0 DIFF 7): el guard `inFlightRef` (FormActions.tsx:30-44)
// bloquea el doble submit — bug R7/R9 reproducido en Crear Cliente y otros
// 74 diálogos. Sin este test una regresión pasaría sin ruido.
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { FormActions } from "@/components/forms/FormActions";

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const form = useForm({ defaultValues: { name: "" } });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormActions submitLabel="Guardar" isPending={false} onCancel={() => {}} />
      </form>
    </FormProvider>
  );
}

function Pending() {
  const form = useForm();
  return (
    <FormProvider {...form}>
      <form>
        <FormActions submitLabel="Guardar" isPending onCancel={() => {}} />
      </form>
    </FormProvider>
  );
}

describe("FormActions — guard anti doble submit", () => {
  it("R7/R9: doble pointerdown rápido solo dispara UN submit (guard inFlight)", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const btn = screen.getByRole("button", { name: "Guardar" });
    // Segundo pointerdown ANTES de que React flushee estado (ventana <25 ms del bug R9).
    fireEvent.pointerDown(btn);
    fireEvent.pointerDown(btn);
    fireEvent.submit(btn.closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("isPending=true deshabilita submit y cancel", () => {
    render(<Pending />);
    expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled();
  });
});
