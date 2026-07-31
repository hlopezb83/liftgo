// @vitest-environment jsdom
// TESTS-ARQ2 (v7.220.0 DIFF 7): el guard `inFlightRef` (FormActions.tsx:30-44)
// bloquea el doble submit — bug R7/R9 reproducido en Crear Cliente y otros
// 74 diálogos. Sin este test una regresión pasaría sin ruido.
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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
  it("R7/R9: dos clicks rápidos en submit solo disparan UN handler (guard inFlight)", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const btn = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    // handleSubmit de RHF es async; esperar microtasks.
    await new Promise((r) => setTimeout(r, 0));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("isPending=true deshabilita submit y cancel", () => {
    render(<Pending />);
    expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled();
  });
});

// R9: ventana de 340ms donde `busy` es transitoriamente `false` entre que
// `formState.isSubmitting` (RHF) baja y `isPending` (React Query) sube.
function DelayedMutationHarness({ onSubmit, gapMs }: { onSubmit: () => void; gapMs: number }) {
  const form = useForm({ defaultValues: { name: "" } });
  const [isPending, setIsPending] = useState(false);

  const handleValid = () => {
    onSubmit();
    // Simula el hueco real: `isSubmitting` ya bajó a `false` (handleSubmit
    // resolvió) y `isPending` sube recién tras `gapMs`.
    setTimeout(() => setIsPending(true), gapMs);
    setTimeout(() => setIsPending(false), gapMs + 50);
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(handleValid)}>
        <FormActions submitLabel="Guardar" isPending={isPending} onCancel={() => {}} />
      </form>
    </FormProvider>
  );
}

function FailingValidationHarness({ onSubmit }: { onSubmit: () => void }) {
  const form = useForm({ defaultValues: { name: "" } });
  form.register("name", { required: true });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormActions submitLabel="Guardar" isPending={false} onCancel={() => {}} />
      </form>
    </FormProvider>
  );
}

describe("FormActions — hardening R9 (ventana busy=false transitoria)", () => {
  it("bloquea un segundo click durante el hueco de 340ms entre isSubmitting y isPending", async () => {
    const onSubmit = vi.fn();
    render(<DelayedMutationHarness onSubmit={onSubmit} gapMs={340} />);
    const btn = screen.getByRole("button", { name: "Guardar" });

    fireEvent.click(btn);
    // Esperamos a que `isSubmitting` de RHF resuelva a `false` (microtask)
    // mientras `isPending` de la mutación simulada aún no sube (< 340ms).
    await new Promise((r) => setTimeout(r, 100));
    // Segundo click cae justo en la ventana "busy=false transitorio".
    fireEvent.click(btn);

    await new Promise((r) => setTimeout(r, 400));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("permite reintentar tras un error de validación async (busy nunca vuelve a true)", async () => {
    const onSubmit = vi.fn();
    render(<FailingValidationHarness onSubmit={onSubmit} />);
    const nameInput = document.querySelector('input[name="name"]');
    if (nameInput) fireEvent.input(nameInput, { target: { value: "" } });
    const btn = screen.getByRole("button", { name: "Guardar" });

    // Primer intento: falla validación (campo requerido vacío) → onSubmit no se llama.
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect(onSubmit).not.toHaveBeenCalled();

    // El guard debe liberarse (debounce corto) y permitir el reintento tras corregir.
    if (nameInput) fireEvent.input(nameInput, { target: { value: "Acme" } });
    await new Promise((r) => setTimeout(r, 500));
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
