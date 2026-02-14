import { useState } from "react";

export function useFormState<T extends Record<string, unknown>>(initial: T) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const reset = () => setForm(initial);
  return { form, set, reset, setForm };
}
