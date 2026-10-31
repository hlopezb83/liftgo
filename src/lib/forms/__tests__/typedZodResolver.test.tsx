import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { typedZodResolver, zodResolver } from "../zodResolver";

const schema = z.object({
  count: z.string().default("0").transform(Number),
  label: z.string().trim().min(1),
});
type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

describe("typedZodResolver opt-in", () => {
  it("keeps raw input distinct from parsed submission output", async () => {
    const { result } = renderHook(() => useForm<Input, unknown, Output>({
      resolver: typedZodResolver(schema), defaultValues: { count: "12", label: "  QA  " },
    }));
    expectTypeOf(result.current.getValues().count).toEqualTypeOf<string | undefined>();
    const submitted = vi.fn<(values: Output) => void>();
    await act(async () => result.current.handleSubmit((values) => {
      expectTypeOf(values.count).toEqualTypeOf<number>();
      submitted(values);
    })());
    expect(submitted).toHaveBeenCalledWith({ count: 12, label: "QA" });
    expect(result.current.getValues().count).toBe("12");
  });

  it("applies schema defaults after reset without retyping raw values", async () => {
    const { result } = renderHook(() => useForm<Input, unknown, Output>({
      resolver: typedZodResolver(schema), defaultValues: { label: "initial", count: "7" },
    }));
    act(() => result.current.reset({ label: " reset " }));
    const submitted = vi.fn();
    await act(async () => result.current.handleSubmit(submitted)());
    expect(submitted.mock.calls[0][0]).toEqual({ count: 0, label: "reset" });
  });

  it("retains the legacy facade for callers not yet migrated", async () => {
    const legacySchema = z.object({ label: z.string() });
    const { result } = renderHook(() => useForm<z.output<typeof legacySchema>>({
      resolver: zodResolver(legacySchema), defaultValues: { label: "legacy" },
    }));
    const submitted = vi.fn();
    await act(async () => result.current.handleSubmit(submitted)());
    expect(submitted.mock.calls[0][0]).toEqual({ label: "legacy" });
  });
});
